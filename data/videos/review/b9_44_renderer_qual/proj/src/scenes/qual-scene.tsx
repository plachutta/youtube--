import {makeScene2D, Rect, Txt} from '@motion-canvas/2d';
import {createRef} from '@motion-canvas/core';
export default makeScene2D(function* (view) {
  const box = createRef<Rect>();
  view.add(<Rect ref={box} width={1200} height={300} fill={'#141b2d'} radius={24} x={0} y={-60}/>);
  view.add(<Txt text={'AGENTTUBE STAGE 2'} fill={'#f8fafc'} fontSize={64} y={-60}/>);
  view.add(<Txt text={'640 x 360 @ 24 fps • 96 frames'} fill={'#94a3b8'} fontSize={36} y={120}/>);
  // 4.0s @ 24fps = 96 frames, covering the full rendering range [0, 95].
  yield* view.waitFor(4);
});
