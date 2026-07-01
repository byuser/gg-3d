// Headless Babylon + DOM + Web Audio stubs for the Vitest suites.
//
// Babylon.js needs a real WebGL canvas, which we don't have in Node. So we stub
// the BABYLON engine + DOM with faithful Vector3/Color3 math and generic
// mesh/node objects, then let the real ES-module game boot against them and the
// tests drive its render-loop observers by hand. This is the exact same seam the
// legacy `test/harness.js` used inside a `vm` context — now installed on
// `globalThis` so `import "../src/game.js"` runs the actual gameplay code.

let uid = 1;

export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  setAll(v) {
    this.x = this.y = this.z = v;
    return this;
  }
  copyFrom(o) {
    this.x = o.x;
    this.y = o.y;
    this.z = o.z;
    return this;
  }
  copyFromFloats(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  clone() {
    return new Vec3(this.x, this.y, this.z);
  }
  add(o) {
    return new Vec3(this.x + o.x, this.y + o.y, this.z + o.z);
  }
  addInPlace(o) {
    this.x += o.x;
    this.y += o.y;
    this.z += o.z;
    return this;
  }
  subtract(o) {
    return new Vec3(this.x - o.x, this.y - o.y, this.z - o.z);
  }
  scale(s) {
    return new Vec3(this.x * s, this.y * s, this.z * s);
  }
  length() {
    return Math.hypot(this.x, this.y, this.z);
  }
  lengthSquared() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  normalize() {
    const l = this.length() || 1;
    this.x /= l;
    this.y /= l;
    this.z /= l;
    return this;
  }
  static Distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }
}

export class Color3 {
  constructor(r = 0, g = 0, b = 0) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
  scale(s) {
    return new Color3(this.r * s, this.g * s, this.b * s);
  }
  add(o) {
    return new Color3(this.r + o.r, this.g + o.g, this.b + o.b);
  }
  clone() {
    return new Color3(this.r, this.g, this.b);
  }
  toColor4(a = 1) {
    return new Color4(this.r, this.g, this.b, a);
  }
  static Lerp(a, b, t) {
    return new Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  }
  static FromHexString(h) {
    h = String(h).replace("#", "");
    return new Color3(
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    );
  }
}

export class Color4 {
  constructor(r = 0, g = 0, b = 0, a = 1) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }
  static FromColor3(c, a = 1) {
    return new Color4(c.r, c.g, c.b, a);
  }
}

// A generic chainable no-op used for visual-only Babylon features (particles,
// glow layer, …) that the headless harness doesn't need to simulate.
export function makeNoop() {
  const fn = () => proxy;
  const target = { color1: {}, color2: {}, colorDead: {}, emitter: null };
  const proxy = new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      return fn;
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  });
  return proxy;
}

export function makeNode() {
  const base = {
    position: new Vec3(),
    rotation: new Vec3(),
    scaling: new Vec3(1, 1, 1),
    uniqueId: uid++,
    isPickable: true,
    material: null,
    parent: null,
    dispose() {},
    setParent() {},
    _enabled: true,
    setEnabled(v) { this._enabled = v !== false; },
    isEnabled() { return this._enabled !== false; },
    addShadowCaster() {},
    getAbsolutePosition() {
      return this.position;
    },
    receiveShadows: false,
    alpha: 1,
    intensity: 1,
    range: 1,
    diffuse: new Color3(),
    specularColor: new Color3(),
    diffuseColor: new Color3(),
    emissiveColor: new Color3(),
    groundColor: new Color3(),
  };
  return new Proxy(base, {
    get(t, p) {
      if (p in t) return t[p];
      t[p] = undefined;
      return t[p];
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  });
}

export const Observable = () => {
  const l = [];
  return {
    add: (f) => {
      l.push(f);
      return f;
    },
    remove: (f) => {
      const i = l.indexOf(f);
      if (i >= 0) l.splice(i, 1);
      return i >= 0;
    },
    _fire: (a) => l.slice().forEach((f) => f(a)),
    list: l,
  };
};

export const scenes = [];

export const BABYLON = {
  Vector3: Vec3,
  Color3,
  Color4,
  Engine: class {
    getDeltaTime() {
      return 16;
    }
    runRenderLoop() {}
    resize() {}
  },
  Scene: class {
    constructor() {
      this.onBeforeRenderObservable = Observable();
      scenes.push(this);
    }
    render() {}
    executeWhenReady(cb) {
      cb();
    }
    registerBeforeRender(f) {
      this.onBeforeRenderObservable.add(f);
    }
  },
  ArcRotateCamera: class {
    constructor() {
      this.alpha = -Math.PI / 2;
      this.target = new Vec3(0, 1.4, 12);
      this.inputs = { removeByType() {} };
    }
    attachControl() {}
  },
  HemisphericLight: class {
    constructor() {
      return makeNode();
    }
  },
  DirectionalLight: class {
    constructor() {
      return makeNode();
    }
  },
  PointLight: class {
    constructor() {
      return makeNode();
    }
  },
  ShadowGenerator: class {
    addShadowCaster() {}
    getShadowMap() {
      return { renderList: [] };
    }
  },
  StandardMaterial: class {
    constructor() {
      return makeNode();
    }
  },
  TransformNode: class {
    constructor() {
      return makeNode();
    }
  },
  MeshBuilder: new Proxy({}, { get: () => () => makeNode() }),
  ParticleSystem: class {
    constructor() {
      return makeNoop();
    }
  },
  GlowLayer: class {
    constructor() {
      return makeNoop();
    }
  },
  Texture: class {
    constructor() {
      return makeNode();
    }
  },
  DynamicTexture: class {
    constructor() {
      return makeNode();
    }
    getContext() {
      return new Proxy({}, { get: () => () => {} });
    }
    update() {}
  },
  Sound: class {
    constructor() {
      return makeNoop();
    }
  },
};
BABYLON.Texture.WRAP_ADDRESSMODE = 1;
BABYLON.ParticleSystem.BLENDMODE_ONEONE = 1;
BABYLON.Scene.FOGMODE_EXP2 = 2;
BABYLON.Scene.FOGMODE_LINEAR = 1;

export const handlers = {};
const elCache = {};

export function makeEl() {
  return new Proxy(
    {
      classList: {
        _s: new Set(),
        add(c) {
          this._s.add(c);
        },
        remove(c) {
          this._s.delete(c);
        },
        contains(c) {
          return this._s.has(c);
        },
        toggle(c, force) {
          const on = force === undefined ? !this._s.has(c) : force;
          if (on) this._s.add(c);
          else this._s.delete(c);
          return on;
        },
      },
      style: {},
      dataset: {},
      addEventListener(ev, fn) {
        (handlers[ev] = handlers[ev] || []).push(fn);
      },
      appendChild() {},
      removeChild() {},
      setAttribute() {},
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 100, height: 100 };
      },
      focus() {},
      click() {},
      textContent: "",
      innerHTML: "",
      disabled: false,
      offsetWidth: 0,
    },
    {
      get(t, p) {
        if (p in t) return t[p];
        t[p] = "";
        return t[p];
      },
      set(t, p, v) {
        t[p] = v;
        return true;
      },
    },
  );
}

export const document = {
  getElementById: (id) => (elCache[id] = elCache[id] || makeEl()),
  createElement: () => makeEl(),
  addEventListener(ev, fn) {
    (handlers[ev] = handlers[ev] || []).push(fn);
  },
  documentElement: makeEl(),
};

export const window = {
  __GG_TEST__: true,
  addEventListener(ev, fn) {
    (handlers[ev] = handlers[ev] || []).push(fn);
  },
  matchMedia: () => ({ matches: false }),
  location: { reload() {} },
};

// A minimal in-memory localStorage so the i18n locale-persistence path runs.
export const localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
    clear: () => m.clear(),
  };
})();

// Install everything the game reads as globals (idempotent across test files).
const g = globalThis;
g.BABYLON = BABYLON;
g.document = document;
g.window = window;
g.localStorage = localStorage;
if (typeof g.requestAnimationFrame === "undefined") g.requestAnimationFrame = () => 0;
if (typeof g.cancelAnimationFrame === "undefined") g.cancelAnimationFrame = () => {};
// Node 18+ exposes a real global `navigator` (CPU count, userAgent, …) that the
// old `vm` sandbox did not. The headless harness simulates a *device-less*
// environment, so the quality-tier auto-detection must see no hints (and resolve
// to "high"). Replace navigator with an empty-hints stub to match that.
Object.defineProperty(g, "navigator", {
  value: { hardwareConcurrency: 0, deviceMemory: 0, userAgent: "", maxTouchPoints: 0 },
  configurable: true,
  writable: true,
});
