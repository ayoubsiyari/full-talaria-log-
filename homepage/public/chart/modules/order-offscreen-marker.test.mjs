import assert from 'node:assert/strict';
import {
    orderOffscreenMarkerV1Enabled,
    resolveOffscreenMarkerEdge,
    clampOffscreenMarkerY,
    markerLabelInPlot,
} from './order-offscreen-marker.mjs';

const disableMarker = process.env.TALARIA_TEST_DISABLE_ORDER_OFFSCREEN_MARKER_V1 === '1';
const scopeOn = disableMarker ? { __TALARIA_DISABLE_ORDER_OFFSCREEN_MARKER_V1: true } : {};
const scopeOff = { __TALARIA_DISABLE_ORDER_OFFSCREEN_MARKER_V1: true };

assert.equal(orderOffscreenMarkerV1Enabled(scopeOn), !disableMarker);
assert.equal(orderOffscreenMarkerV1Enabled(scopeOff), false);
assert.equal(orderOffscreenMarkerV1Enabled({}), true, 'default ON when unset');

const plotTop = 40;
const plotBottom = 400;

assert.equal(resolveOffscreenMarkerEdge(200, plotTop, plotBottom), null, 'in-plot → no marker');
assert.equal(resolveOffscreenMarkerEdge(10, plotTop, plotBottom), 'above');
assert.equal(resolveOffscreenMarkerEdge(500, plotTop, plotBottom), 'below');

const aboveY = clampOffscreenMarkerY('above', plotTop, plotBottom, 14);
const belowY = clampOffscreenMarkerY('below', plotTop, plotBottom, 14);
assert.equal(aboveY, plotTop + 14);
assert.equal(belowY, plotBottom - 14);
assert.equal(markerLabelInPlot(aboveY, plotTop, plotBottom), true, 'RC5-VIS-1: marker Y within plot');
assert.equal(markerLabelInPlot(belowY, plotTop, plotBottom), true, 'RC5-VIS-3: panel uses same math');

const offDomainY = 800;
assert.equal(resolveOffscreenMarkerEdge(offDomainY, plotTop, plotBottom), 'below');
assert.equal(markerLabelInPlot(offDomainY, plotTop, plotBottom), false, 'raw level Y off-plot');
assert.equal(markerLabelInPlot(belowY, plotTop, plotBottom), true, 'clamped marker on-plot');

if (!orderOffscreenMarkerV1Enabled(scopeOff)) {
    assert.equal(resolveOffscreenMarkerEdge(10, plotTop, plotBottom), 'above', 'geometry unchanged when switch OFF');
}

console.log(disableMarker
    ? 'GREEN — helpers present; switch-OFF disables marker feature (RED-again)'
    : 'GREEN — off-screen marker edge math + in-plot clamp passed');
