// CS405 · Lab 1 — WebGPU square
const canvas = document.querySelector('canvas');
if (!navigator.gpu) throw new Error('WebGPU not available');

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error('WebGPU adapter not available');
const device = await adapter.requestDevice();
const ctx = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format, alphaMode: 'opaque' });
console.log('WebGPU ready:', format);

const SHADER = `
  struct U {
    time: f32, pad: f32,
    size: vec2f,
    mouse: vec2f, padding: vec2f
  };
  @group(0) @binding(0) var<uniform> u: U;

  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) colour: vec4f
  };

  @vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
    // Two triangles sharing the same diagonal: six vertices.
    var p = array<vec2f, 6>(
      vec2f(-0.3, -0.3), vec2f(0.3, -0.3), vec2f(0.3, 0.3),
      vec2f(-0.3, -0.3), vec2f(0.3, 0.3), vec2f(-0.3, 0.3));
    var c = array<vec3f, 6>(
      vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0),
      vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), vec3f(1.0, 1.0, 0.0));

    let a = u.time;
    // WGSL matrices are constructed column by column.
    let rotation = mat2x2f(
      vec2f(cos(a), sin(a)),
      vec2f(-sin(a), cos(a))
    );
    let q = rotation * p[i];
    // Same pixel scale on both axes keeps the square square.
    let scale = vec2f(min(u.size.x, u.size.y)) / u.size;
    var out: VSOut;
    out.pos = vec4f(q * scale + u.mouse, 0.0, 1.0);
    out.colour = vec4f(c[i], 1.0);
    return out;
  }

  @fragment fn fs(in: VSOut) -> @location(0) vec4f {
    return in.colour;
  }`;

const module = device.createShaderModule({ code: SHADER });
const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: { module, entryPoint: 'vs' },
  fragment: { module, entryPoint: 'fs', targets: [{ format }] }
});

const ubuf = device.createBuffer({
  size: 32,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});
const bind = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: ubuf } }]
});

let mouseX = 0;
let mouseY = 0;
canvas.addEventListener('pointermove', event => {
  const r = canvas.getBoundingClientRect();
  mouseX = (event.clientX - r.left) / r.width * 2 - 1;
  mouseY = 1 - (event.clientY - r.top) / r.height * 2;
});

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
}
window.addEventListener('resize', resize);
resize();

const t0 = performance.now();
function frame() {
  const t = (performance.now() - t0) * 0.001;
  // Time, padding, canvas size, mouse position, padding.
  device.queue.writeBuffer(ubuf, 0, new Float32Array([
    t, 0, canvas.width, canvas.height, mouseX, mouseY, 0, 0
  ]));

  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({ colorAttachments: [{
    view: ctx.getCurrentTexture().createView(),
    clearValue: { r: 0.19, g: 0.2, b: 0.6, a: 1 },
    loadOp: 'clear', storeOp: 'store'
  }] });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.draw(6);
  pass.end();
  device.queue.submit([enc.finish()]);
  requestAnimationFrame(frame);
}
frame();
