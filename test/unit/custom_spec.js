/* Copyright 2017 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { buildGetDocumentParams } from "./test_utils.js";
import { getDocument } from "../../src/display/api.js";

function getTopLeftPixel(canvasContext) {
  const imgData = canvasContext.getImageData(0, 0, 1, 1);
  return {
    r: imgData.data[0],
    g: imgData.data[1],
    b: imgData.data[2],
    a: imgData.data[3],
  };
}

describe("custom canvas rendering", function () {
  const transparentGetDocumentParams =
    buildGetDocumentParams("transparent.pdf");

  let loadingTask, doc, page;

  beforeAll(async function () {
    loadingTask = getDocument(transparentGetDocumentParams);
    doc = await loadingTask.promise;
    page = await doc.getPage(1);
  });

  afterAll(async function () {
    doc = null;
    page = null;
    await loadingTask.destroy();
  });

  it("renders to canvas with a default white background", async function () {
    const viewport = page.getViewport({ scale: 1 });
    const { canvasFactory } = doc;
    const canvasAndCtx = canvasFactory.create(viewport.width, viewport.height);

    const renderTask = page.render({
      canvas: canvasAndCtx.canvas,
      viewport,
    });
    await renderTask.promise;

    expect(getTopLeftPixel(canvasAndCtx.context)).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 255,
    });
    canvasFactory.destroy(canvasAndCtx);
  });

  it("renders to canvas with a custom background", async function () {
    const viewport = page.getViewport({ scale: 1 });
    const { canvasFactory } = doc;
    const canvasAndCtx = canvasFactory.create(viewport.width, viewport.height);

    const renderTask = page.render({
      canvas: canvasAndCtx.canvas,
      viewport,
      background: "rgba(255,0,0,1.0)",
    });
    await renderTask.promise;

    expect(getTopLeftPixel(canvasAndCtx.context)).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 255,
    });
    canvasFactory.destroy(canvasAndCtx);
  });
});

describe("custom ownerDocument", function () {
  const FontFace = globalThis.FontFace;

  const checkFont = font => /g_d\d+_f1/.test(font.family);
  const checkFontFaceRule = rule =>
    /^@font-face {font-family:"g_d\d+_f1";src:/.test(rule);

  beforeEach(() => {
    globalThis.FontFace = function MockFontFace(name) {
      this.family = name;
    };
  });

  afterEach(() => {
    globalThis.FontFace = FontFace;
  });

  function getMocks() {
    const elements = [];
    const createElement = name => {
      let element =
        typeof document !== "undefined" && document.createElement(name);
      if (name === "style") {
        element = {
          tagName: name,
          sheet: {
            cssRules: [],
            insertRule(rule) {
              this.cssRules.push(rule);
            },
          },
        };
        Object.assign(element, {
          remove() {
            this.remove.called = true;
          },
        });
      }
      elements.push(element);
      return element;
    };
    const ownerDocument = {
      fonts: new Set(),
      createElement,
      documentElement: {
        getElementsByTagName: () => [{ append: () => {} }],
      },
    };

    return {
      elements,
      ownerDocument,
    };
  }

  it("should use given document for loading fonts (with Font Loading API)", async function () {
    const { ownerDocument, elements } = getMocks();
    const getDocumentParams = buildGetDocumentParams(
      "TrueType_without_cmap.pdf",
      {
        disableFontFace: false,
        ownerDocument,
      }
    );

    const loadingTask = getDocument(getDocumentParams);
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);

    const viewport = page.getViewport({ scale: 1 });
    const { canvasFactory } = doc;
    const canvasAndCtx = canvasFactory.create(viewport.width, viewport.height);

    await page.render({
      canvas: canvasAndCtx.canvas,
      viewport,
    }).promise;

    const style = elements.find(element => element.tagName === "style");
    expect(style).toBeFalsy();
    expect(ownerDocument.fonts.size).toBeGreaterThanOrEqual(1);
    expect(Array.from(ownerDocument.fonts).find(checkFont)).toBeTruthy();

    await loadingTask.destroy();
    canvasFactory.destroy(canvasAndCtx);
    expect(ownerDocument.fonts.size).toBe(0);
  });

  it("should use given document for loading fonts (with CSS rules)", async function () {
    const { ownerDocument, elements } = getMocks();
    ownerDocument.fonts = null;
    const getDocumentParams = buildGetDocumentParams(
      "TrueType_without_cmap.pdf",
      {
        disableFontFace: false,
        ownerDocument,
      }
    );

    const loadingTask = getDocument(getDocumentParams);
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);

    const viewport = page.getViewport({ scale: 1 });
    const { canvasFactory } = doc;
    const canvasAndCtx = canvasFactory.create(viewport.width, viewport.height);

    await page.render({
      canvas: canvasAndCtx.canvas,
      viewport,
    }).promise;

    const style = elements.find(element => element.tagName === "style");
    expect(style.sheet.cssRules.length).toBeGreaterThanOrEqual(1);
    expect(style.sheet.cssRules.find(checkFontFaceRule)).toBeTruthy();

    await loadingTask.destroy();
    canvasFactory.destroy(canvasAndCtx);
    expect(style.remove.called).toBe(true);
  });
});
