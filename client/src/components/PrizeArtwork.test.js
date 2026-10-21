import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import PrizeArtwork from "./PrizeArtwork";

let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

test("versioned images are lazy, have fixed dimensions and show a fallback on error", async () => {
  const source = `/api/prizes/1/image/${"a".repeat(64)}`;
  await act(async () => root.render(<PrizeArtwork source={source} />));
  const image = container.querySelector("img");
  expect(image.getAttribute("src")).toBe(source);
  expect(image.getAttribute("loading")).toBe("lazy");
  expect(image.getAttribute("width")).toBe("42");
  await act(async () => Simulate.error(image));
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toBe("—");
  await act(async () => root.render(<PrizeArtwork source={`/api/prizes/1/image/${"b".repeat(64)}`} />));
  expect(container.querySelector("img")).not.toBeNull();
});

test("emoji, empty images and new upload previews are supported", async () => {
  await act(async () => root.render(<PrizeArtwork source="🦒" />));
  expect(container.textContent).toBe("🦒");
  await act(async () => root.render(<PrizeArtwork source="" />));
  expect(container.textContent).toBe("—");
  await act(async () => root.render(<PrizeArtwork source="data:image/png;base64,YQ==" />));
  expect(container.querySelector("img")).not.toBeNull();
});
