import "./style.css";

import {
  Engine,
  Runner,
  Bodies,
  Composite,
  Common,
  Svg,
  Mouse,
  MouseConstraint,
  Vertices,
  Events,
} from "matter-js";
import PolyDecomp from "poly-decomp";
import "pathseg";
import * as tome from "chromotome";

const SVG_WIDTH = 41.8;
const SVG_HEIGHT = 49.7;
const DPR = window.devicePixelRatio;
const DENSITY = 0.00025;

Common.setDecomp(PolyDecomp);

class App {
  shapes = [];

  constructor() {
    this.draw = this.draw.bind(this);
    this.updateGravity = this.updateGravity.bind(this);
    this.updatePalette = this.updatePalette.bind(this);

    this.pickRandomPalette();

    this.engine = Engine.create({
      positionIterations: 1,
      enableSleeping: true,
    });

    // Use custom renderer instead
    // this.debugRenderer = Render.create({
    //   element: document.body,
    //   engine: this.engine,
    //   options: {
    //     width: window.innerWidth,
    //     height: window.innerHeight,
    //     wireframes: false,
    //     // background: this.palette.background,
    //     background: "#000000",
    //     // pixelRatio: window.devicePixelRatio,
    //     // showStats: true,
    //     // showPerformance: true,
    //   },
    // });
    // Render.run(this.debugRenderer);

    // create runner
    this.runner = Runner.create();

    // run the engine
    Runner.run(this.runner, this.engine);

    this.canvasEl = document.createElement("canvas");
    this.canvasEl.width = window.innerWidth * DPR;
    this.canvasEl.height = window.innerHeight * DPR;
    this.canvasEl.style.zIndex = "1";
    // this.canvasEl.style.pointerEvents = "none";
    this.ctx = this.canvasEl.getContext("2d");
    document.body.appendChild(this.canvasEl);

    Events.on(this.runner, "tick", this.draw);

    if (typeof DeviceMotionEvent.requestPermission === "function") {
      const buttonEl = document.querySelector("[data-allow-orientation]");
      buttonEl.style.display = "block";
      buttonEl.addEventListener("click", () => {
        DeviceOrientationEvent.requestPermission()
          .then((response) => {
            buttonEl.style.display = "none";
            if (response == "granted") {
              window.addEventListener(
                "deviceorientation",
                this.updateGravity,
                false
              );
            }
          })
          .catch((e) => {
            console.error(e);
            buttonEl.style.display = "none";
          });
      });
    } else {
      window.addEventListener("deviceorientation", this.updateGravity, false);
    }

    this.buttonEl = document.querySelector("[data-button]");
    this.buttonEl.addEventListener("click", this.updatePalette);
  }

  initWalls() {
    const { innerWidth, innerHeight } = window;

    const w = innerWidth * DPR;
    const h = innerHeight * DPR;

    const padding = 10 * DPR;

    const options = {
      isStatic: true,
      render: {
        visible: false,
      },
    };

    const leftWall = Bodies.rectangle(
      0 - w / 2 + padding,
      h / 2,
      w,
      h,
      options
    );

    const rightWall = Bodies.rectangle(w * 1.5 - padding, h / 2, w, h, options);

    const topWall = Bodies.rectangle(w / 2, 0 - h / 2 + padding, w, h, options);

    const bottomWall = Bodies.rectangle(
      w / 2,
      h * 1.5 - padding,
      w,
      h,
      options
    );

    this.walls = [leftWall, rightWall, topWall, bottomWall];

    Composite.add(this.engine.world, this.walls);
  }

  initShapes() {
    const select = function (root, selector) {
      return Array.prototype.slice.call(root.querySelectorAll(selector));
    };

    const svgEl = document.querySelector("[data-svg]");

    const SVG_SIZE = Math.max(SVG_WIDTH, SVG_HEIGHT);
    const maxAttempsToPosition = 10;
    const count = Math.round(
      this.canvasEl.width * this.canvasEl.height * DENSITY
    );

    for (let i = 0; i < count; i++) {
      const scale = Common.random(0.25 * DPR, 2 * DPR);
      let isColliding = true;
      let attempsToPosition = 0;
      let x = 0;
      let y = 0;

      const vertexSets = select(svgEl, "path").map((path) =>
        Vertices.scale(Svg.pathToVertices(path, 30), scale, scale)
      );

      while (isColliding && attempsToPosition < maxAttempsToPosition) {
        x = Math.random() * this.canvasEl.width;
        y = Math.random() * this.canvasEl.height;

        if (this.shapes.length > 0) {
          // Perform circle to circle collision detection from potential new body
          // against every other existing bodies.
          for (let j = 0; j < this.shapes.length; j++) {
            const dx = x - this.shapes[j].body.position.x;
            const dy = y - this.shapes[j].body.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            isColliding =
              distance <
              (SVG_SIZE * scale) / 2 + (SVG_SIZE * this.shapes[j].scale) / 2;

            if (isColliding) {
              // No need to test against other bodies if we already have a collision detected/
              break;
            }
          }
        } else {
          isColliding = false;
          break;
        }

        attempsToPosition++;
      }

      // If all attemps to position new body failed (it collided w antoerh body everytime)
      // we just ignore it and not not add it to scene.
      if (isColliding && attempsToPosition >= maxAttempsToPosition) {
        continue;
      }

      this.shapes.push({
        body: Bodies.fromVertices(
          x,
          y,
          vertexSets,
          {
            angle: Common.random(-1, 1),
            // friction: 1,
            // frictionStatic: 0.5,
            restitution: 0,
            render: {
              fillStyle: "#ffffff",
              strokeStyle: "#ff0000",
              lineWidth: 1,
            },
          },
          true
        ),
        scale,
        fill: Common.choose(this.palette.colors),
      });
    }

    Composite.add(
      this.engine.world,
      this.shapes.map((s) => s.body)
    );
  }

  initMouse() {
    this.mouse = Mouse.create(this.canvasEl);

    this.mouseConstraint = MouseConstraint.create(this.engine, {
      mouse: this.mouse,
      constraint: {
        stiffness: 0.2,
      },
    });

    Composite.add(this.engine.world, this.mouseConstraint);
  }

  init() {
    this.initMouse();
    this.initWalls();
    this.initShapes();
  }

  onResize() {
    Composite.clear(this.engine.world);
    this.shapes.length = 0;

    // this.debugRenderer.bounds.max.x = window.innerWidth;
    // this.debugRenderer.bounds.max.y = window.innerHeight;
    // this.debugRenderer.options.width = window.innerWidth;
    // this.debugRenderer.options.height = window.innerHeight;
    // this.debugRenderer.canvas.width = window.innerWidth;
    // this.debugRenderer.canvas.height = window.innerHeight;
    // Matter.Render.setPixelRatio(render, window.devicePixelRatio); // added this

    this.canvasEl.width = window.innerWidth * DPR;
    this.canvasEl.height = window.innerHeight * DPR;

    this.pickRandomPalette();
    // this.debugRenderer.options.background = this.palette.background;

    this.init();
  }

  draw() {
    this.ctx.fillStyle = this.palette.background;
    this.ctx.fillRect(0, 0, this.canvasEl.width, this.canvasEl.height);

    for (var i = 0; i < this.shapes.length; i += 1) {
      this.ctx.save();

      const translateX = this.shapes[i].body.position.x - SVG_WIDTH / 2;
      const translateY = this.shapes[i].body.position.y - SVG_HEIGHT / 2;

      this.ctx.translate(
        translateX + SVG_WIDTH / 2,
        translateY + SVG_HEIGHT / 2
      );
      this.ctx.rotate(this.shapes[i].body.angle);
      this.ctx.scale(this.shapes[i].scale, this.shapes[i].scale);
      this.ctx.translate(-SVG_WIDTH / 2, -SVG_HEIGHT / 2);

      this.ctx.beginPath();
      const p = new Path2D(
        "m20.6 43.5-10.3 6.2L.1 43.6l-.1-25L31.3 0v12.5l10.3 6.2.2 25-10.4 6-10-6.1 10-6.1-.2-12.5-10.6 6.3-10-6.3v12.4z"
      );

      this.ctx.lineWidth = 1;
      this.ctx.fillStyle = this.shapes[i].fill;
      this.ctx.fill(p);
      this.ctx.restore();
    }
  }

  updateGravity(e) {
    const orientation =
      typeof window.orientation !== "undefined" ? window.orientation : 0;

    if (e.gamma === null && e.beta === null) {
      this.engine.gravity.scale = 0.001;
      this.engine.gravity.x = 0;
      this.engine.gravity.y = 1;
    } else {
      this.engine.gravity.scale = 0.0025;

      if (orientation === 0) {
        this.engine.gravity.x = Common.clamp(e.gamma, -90, 90) / 90;
        this.engine.gravity.y = Common.clamp(e.beta, -90, 90) / 90;
      } else if (orientation === 180) {
        this.engine.gravity.x = Common.clamp(e.gamma, -90, 90) / 90;
        this.engine.gravity.y = Common.clamp(-e.beta, -90, 90) / 90;
      } else if (orientation === 90) {
        this.engine.gravity.x = Common.clamp(e.beta, -90, 90) / 90;
        this.engine.gravity.y = Common.clamp(-e.gamma, -90, 90) / 90;
      } else if (orientation === -90) {
        this.engine.gravity.x = Common.clamp(-e.beta, -90, 90) / 90;
        this.engine.gravity.y = Common.clamp(e.gamma, -90, 90) / 90;
      }
    }
  }

  updatePalette() {
    this.onResize();
  }

  pickRandomPalette() {
    let ok = false;

    while (!ok) {
      this.palette = tome.get();
      ok = !this.palette.colors.includes(this.palette.background);
      console.log(this.palette);
    }
  }
}

const app = new App();
app.init();
window.addEventListener("resize", () => {
  app.onResize();
});
