import motionCanvasPlugin from '@motion-canvas/vite-plugin';
import ffmpegExporterPlugin from '@motion-canvas/ffmpeg';
import preact from '@preact/preset-vite';
import {defineConfig} from 'vite';
const motionCanvas = motionCanvasPlugin.default || motionCanvasPlugin;
const ffmpegExporter = ffmpegExporterPlugin.default || ffmpegExporterPlugin;
export default defineConfig({ plugins: [preact(), motionCanvas({ project: './src/project.ts' }), ffmpegExporter()] });
