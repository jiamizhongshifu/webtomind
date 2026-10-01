import { describe, expect, it } from 'vitest';
import { expansionFrame, fitCropToAspect, resizeCropRect } from '../ImageEditorCanvas';

describe('crop and expansion geometry', () => {
  for (const sourceRatio of [0.5, 1, 1.5, 3]) {
    for (const aspect of ['1:1', '2.35:1', '9:16', '4:3']) {
      it(`keeps crop inside and expansion outside the source: ${sourceRatio} -> ${aspect}`, () => {
        const [w,h] = aspect.split(':').map(Number);
        const crop = fitCropToAspect({x:0,y:0,width:1,height:1}, aspect, sourceRatio, 0);
        expect(crop.x).toBeGreaterThanOrEqual(0);
        expect(crop.y).toBeGreaterThanOrEqual(0);
        expect(crop.x+crop.width).toBeLessThanOrEqual(1.000001);
        expect(crop.y+crop.height).toBeLessThanOrEqual(1.000001);
        expect(crop.width / crop.height * sourceRatio).toBeCloseTo(w/h);
        const expand = expansionFrame(aspect, sourceRatio);
        expect(expand.x).toBeLessThan(0);
        expect(expand.y).toBeLessThan(0);
        expect(expand.x+expand.width).toBeGreaterThan(1);
        expect(expand.y+expand.height).toBeGreaterThan(1);
        expect(expand.width / expand.height * sourceRatio).toBeCloseTo(w/h);
      });
    }
  }
});

it('keeps the chosen ratio and anchor when crop handles are dragged past image edges', () => {
  const rect = {x:0.2,y:0.3,width:0.6,height:0.4};
  for (const handle of ['nw','ne','sw','se','n','s','w','e']) {
    const result = resizeCropRect(rect,handle,{x:handle.includes('w') ? -1 : 2,y:handle.includes('n') ? -1 : 2},'3:2',1);
    expect(result.width/result.height).toBeCloseTo(1.5);
    expect(result.x).toBeGreaterThanOrEqual(-0.000001);
    expect(result.y).toBeGreaterThanOrEqual(-0.000001);
    expect(result.x+result.width).toBeLessThanOrEqual(1.000001);
    expect(result.y+result.height).toBeLessThanOrEqual(1.000001);
  }
});
