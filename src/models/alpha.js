/**
 * Combined Alpha Signal — Model §4
 *
 * α(t) = b₁·OFI_norm(t) + b₂·sign(S_adv)·|S_adv|^0.5 + b₃·(VPIN_thresh − VPIN(t))
 *
 * TRADE if |α(t)| > θ AND VPIN(t) < toxic_thresh
 *
 * Coefficients: b1=0.40, b2=0.30, b3=0.30 (equally weighted components)
 * Threshold θ = 0.15 (15% of normalized range)
 */

const B1 = 0.40;  // OFI weight
const B2 = 0.30;  // Spread decomposition weight
const B3 = 0.30;  // VPIN component weight
const THETA = 0.15; // Alpha threshold for trade signal

/**
 * Compute combined alpha signal.
 *
 * @param {Object} ofiResult    From computeOFI()
 * @param {Object} vpinResult   From computeVPIN()
 * @param {Object} kellyResult  From computeKelly() (contains spread decomposition)
 * @returns {Object} alpha signal and trade decision
 */
export function computeAlpha(ofiResult, vpinResult, kellyResult) {
  const ofiNorm = ofiResult?.current ?? 0;
  const { current: vpinCurrent, mu: vpinMu, toxicThreshold } = vpinResult?.stats ?? {};
  const adverseFraction = kellyResult?.spread?.adverseFraction ?? 0.5;

  // Component 1: OFI (already normalized to [-1, 1])
  const c1 = B1 * ofiNorm;

  // Component 2: Adverse selection spread — sign(S_adv) * |S_adv|^0.5
  const sAdv = adverseFraction - 0.5;  // centered at 0.5
  const c2 = B2 * Math.sign(sAdv) * Math.sqrt(Math.abs(sAdv));

  // Component 3: VPIN deviation from threshold (positive = below toxic, favorable)
  const vpinThresh = toxicThreshold ?? 0.5;
  const vpinCurr = vpinCurrent ?? 0.3;
  const vpinDev = Math.min(vpinThresh - vpinCurr, 1); // clamp
  const c3 = B3 * vpinDev;

  const alpha = c1 + c2 + c3;

  const isToxic = vpinResult?.isToxic ?? false;
  const shouldTrade = Math.abs(alpha) > THETA && !isToxic;

  const direction = alpha > THETA
    ? 'LONG'
    : alpha < -THETA
      ? 'SHORT'
      : 'FLAT';

  // Signal strength 0–100
  const strength = Math.min(100, Math.round(Math.abs(alpha) / (B1 + B2 + B3) * 100));

  return {
    alpha,
    components: { c1, c2, c3 },
    coefficients: { b1: B1, b2: B2, b3: B3 },
    shouldTrade,
    direction: isToxic ? 'BLOCKED — TOXIC FLOW' : direction,
    strength,
    threshold: THETA,
    isToxic,
    interpretation: isToxic
      ? 'Position reduction triggered: VPIN toxicity detected'
      : shouldTrade
        ? `${direction} signal above threshold θ=${THETA}`
        : 'Alpha below threshold — no edge detected',
  };
}
