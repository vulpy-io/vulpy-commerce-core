import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  handleNavigationClick,
  registerNavigationClickListener,
} from "./TopLoadingBar";

class TestElement {
  closest(selector: string): TestAnchor | null {
    return selector === "a" ? new TestAnchor() : null;
  }
}

class TestAnchor {
  readonly href: string;
  constructor(href = "/shop") {
    this.href = href;
  }

  target = "";

  download = false;

  hasAttribute(_name: string): boolean {
    return this.download;
  }

  getAttribute(name: string): string | null {
    return name === "href" ? this.href : null;
  }
}

class TestDocument {
  private readonly captureListeners: ((event: MouseEvent) => void)[] = [];
  private readonly bubbleListeners: ((event: MouseEvent) => void)[] = [];

  addEventListener(
    _type: string,
    listener: (event: MouseEvent) => void,
    capture = false,
  ): void {
    (capture ? this.captureListeners : this.bubbleListeners).push(listener);
  }

  removeEventListener(): void {
    // intentional no-op: test stub
  }

  dispatchClick(event: MouseEvent): void {
    for (const listener of this.captureListeners) {
      listener(event);
    }
    for (const listener of this.bubbleListeners) {
      listener(event);
    }
  }
}

function internalLinkEvent(anchor = new TestAnchor()): MouseEvent {
  return {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    target: new (class extends TestElement {
      override closest(selector: string): TestAnchor | null {
        return selector === "a" ? anchor : null;
      }
    })(),
  } as unknown as MouseEvent;
}

describe("TopLoadingBar navigation start", () => {
  beforeEach(() => {
    vi.stubGlobal("Element", TestElement);
    vi.stubGlobal("HTMLAnchorElement", TestAnchor);
    vi.stubGlobal("window", {
      location: {
        href: "https://example.com/",
        origin: "https://example.com",
        pathname: "/",
        search: "",
      },
      setTimeout,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts immediately when an internal link click is handled", () => {
    const startProgress = vi.fn();
    handleNavigationClick(internalLinkEvent(), startProgress);

    expect(startProgress).toHaveBeenCalledTimes(1);
  });

  it("registers in capture phase so loading starts before bubble navigation", () => {
    const order: string[] = [];
    const document = new TestDocument();

    registerNavigationClickListener(document as unknown as Document, (event) =>
      handleNavigationClick(event, () => order.push("loading")),
    );
    document.addEventListener("click", () => order.push("navigation"));

    document.dispatchClick(internalLinkEvent());

    expect(order).toEqual(["loading", "navigation"]);
  });

  it.each([
    ["modified clicks", { metaKey: true }],
    ["external links", {}, new TestAnchor("https://other.example/shop")],
    ["hash links", {}, new TestAnchor("#details")],
    ["downloads", {}, Object.assign(new TestAnchor(), { download: true })],
    ["same-URL links", {}, new TestAnchor("/")],
  ])("does not start for %s", (_name, modifiers = {}, anchor = new TestAnchor()) => {
    const startProgress = vi.fn();
    handleNavigationClick(
      { ...internalLinkEvent(anchor), ...modifiers } as MouseEvent,
      startProgress,
    );

    expect(startProgress).not.toHaveBeenCalled();
  });
});
