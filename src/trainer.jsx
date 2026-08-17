import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";

/* ==========================================================================
   TRIM — sail trim trainer for a 40 ft cruiser-racer
   Simplified VPP: apparent wind, sail lift/drag with camber & twist, forestay
   sag, mast bend, heel, leeway, rudder drag, wave resistance, surfing.
   ========================================================================== */

const KT = 0.514444;
const RHO_A = 1.225, RHO_W = 1025, G = 9.81;
const d2r = Math.PI / 180, r2d = 180 / Math.PI;
const cl = (v, a, b) => Math.max(a, Math.min(b, v));

/* ------------------------------- boat library ---------------------------- */
// cam: mainsail depth coefficients · fn0/wexp: wave-making onset & steepness
// mono righting moment ~ disp·g·GM·sinφ ; cat ~ disp·g·rmBeam·beam (near constant)
const BOATS = {
  cr40: {
    label: ["40 ft cruiser-racer", "40 ft kruiser-võistleja"], type: "mono",
    loa: 12.35, lwl: 11.10, beam: 3.99, draft: 2.15, disp: 8600, GM: 1.28,
    Sw: 30, cf: 0.0029, fn0: 0.295, wexp: 5.4, keelA: 6.0, keelEff: 2.7,
    rmArm: 6.6, heelRef: 30, heelMax: 70, helmK: 1.0, sagK: 1500, dminAdd: 0,
    mainA: 46, P: 16.0, E: 5.10, I: 15.2, J: 4.60, headTaper: [0.86, 1.3], boomZ: 1.55, deckZ: 0.92,
    twist0: 30, boomR: 78, travR: 16, reefWind: [19, 26, 32],
    cam: { base: 0.180, out: 0.055, bs: 0.050, cun: 0.020, run: 0.015, hal: 0.018, min: 0.050, max: 0.20 },
    ctrl: { backstay: 1, runners: 1, vang: 1, cunningham: 1 },
    sails: { jib: 36, genoa: 48, code0: 88, asym: 130, sym: 120 },
  },
  sport35: {
    label: ["35 ft sportboat", "35 ft sportpaat"], type: "mono",
    loa: 10.70, lwl: 10.20, beam: 3.40, draft: 2.30, disp: 3800, GM: 1.62,
    Sw: 19, cf: 0.0031, fn0: 0.335, wexp: 4.4, keelA: 4.2, keelEff: 3.1,
    rmArm: 6.2, heelRef: 26, heelMax: 70, helmK: 1.15, sagK: 1300, dminAdd: -1,
    mainA: 42, P: 14.5, E: 4.60, I: 14.0, J: 3.90, headTaper: [0.88, 1.35], boomZ: 1.25, deckZ: 0.70,
    twist0: 30, boomR: 80, travR: 18, reefWind: [16, 22, 28],
    cam: { base: 0.175, out: 0.060, bs: 0.055, cun: 0.020, run: 0.012, hal: 0.018, min: 0.048, max: 0.20 },
    ctrl: { backstay: 1, runners: 1, vang: 1, cunningham: 1 },
    sails: { jib: 26, genoa: 32, code0: 70, asym: 105 },
  },
  blue48: {
    label: ["48 ft bluewater cruiser", "48 ft ookeanikruiser"], type: "mono",
    loa: 14.60, lwl: 13.20, beam: 4.50, draft: 2.00, disp: 18000, GM: 1.26,
    Sw: 46, cf: 0.0028, fn0: 0.278, wexp: 5.8, keelA: 9.0, keelEff: 2.2,
    rmArm: 7.4, heelRef: 28, heelMax: 70, helmK: 0.9, sagK: 1800, dminAdd: 1,
    mainA: 60, P: 18.0, E: 6.20, I: 17.5, J: 5.60, headTaper: [0.84, 1.25], boomZ: 1.85, deckZ: 1.10,
    twist0: 30, boomR: 76, travR: 13, reefWind: [22, 29, 35],
    cam: { base: 0.185, out: 0.050, bs: 0.035, cun: 0.020, run: 0.010, hal: 0.015, min: 0.055, max: 0.21 },
    ctrl: { backstay: 1, runners: 1, vang: 1, cunningham: 1 },
    sails: { jib: 48, genoa: 72, code0: 110, asym: 150 },
  },
  cat42: {
    label: ["42 ft cruising catamaran", "42 ft kruiisikatamaraan"], type: "cat",
    loa: 12.80, lwl: 12.40, beam: 7.20, draft: 1.30, disp: 12500, rmBeam: 0.40,
    Sw: 50, cf: 0.0032, fn0: 0.372, wexp: 4.9, keelA: 5.0, keelEff: 1.9,
    rmArm: 8.2, heelRef: 12, heelMax: 11, helmK: 0.6, sagK: 2600, dminAdd: 3,
    mainA: 65, P: 17.5, E: 6.40, I: 17.0, J: 5.60, headTaper: [0.52, 2.1], boomZ: 3.05, deckZ: 1.55,
    twist0: 34, boomR: 78, travR: 26, reefWind: [18, 24, 30],
    cam: { base: 0.190, out: 0.085, bs: 0, cun: 0.030, run: 0, hal: 0.030, min: 0.055, max: 0.21 },
    ctrl: { backstay: 0, runners: 0, vang: 1, cunningham: 1 },
    sails: { jib: 40, genoa: 52, code0: 90, asym: 130 },
    hullHalfW: 0.62,
  },
  pcat45: {
    label: ["45 ft performance catamaran", "45 ft võidusõidukatamaraan"], type: "cat",
    loa: 13.70, lwl: 13.50, beam: 7.60, draft: 2.40, disp: 9000, rmBeam: 0.42,
    Sw: 42, cf: 0.0031, fn0: 0.435, wexp: 4.3, keelA: 4.6, keelEff: 3.1,
    rmArm: 8.8, heelRef: 12, heelMax: 10, helmK: 0.65, sagK: 3000, dminAdd: 1,
    mainA: 88, P: 19.5, E: 7.00, I: 19.0, J: 6.00, headTaper: [0.50, 2.2], boomZ: 3.20, deckZ: 1.60,
    twist0: 34, boomR: 78, travR: 28, reefWind: [17, 23, 29],
    cam: { base: 0.185, out: 0.085, bs: 0, cun: 0.030, run: 0, hal: 0.030, min: 0.050, max: 0.20 },
    ctrl: { backstay: 0, runners: 0, vang: 1, cunningham: 1 },
    sails: { jib: 38, genoa: 52, code0: 110, asym: 165 },
    hullHalfW: 0.58,
  },
};
const BOAT_KEYS = Object.keys(BOATS);

const SAIL_TYPES = {
  none:  { label: ["No headsail", "Eespurjeta"],    dmin: 0,  dmax: 0,   cmin: 0.10,  cmax: 0.10,  ar: 1,   minTwa: 0,   maxTwa: 180 },
  jib:   { label: ["Jib", "Foka"],                  dmin: 7,  dmax: 30,  cmin: 0.075, cmax: 0.165, ar: 3.7, minTwa: 28,  maxTwa: 135 },
  genoa: { label: ["Genoa", "Genua"],               dmin: 9,  dmax: 36,  cmin: 0.090, cmax: 0.185, ar: 3.0, minTwa: 30,  maxTwa: 160 },
  code0: { label: ["Code 0", "Code 0"],             dmin: 14, dmax: 58,  cmin: 0.110, cmax: 0.205, ar: 2.6, minTwa: 62,  maxTwa: 140 },
  asym:  { label: ["Asymmetric", "Asümmeetriline"], dmin: 28, dmax: 96,  cmin: 0.170, cmax: 0.300, ar: 1.9, minTwa: 78,  maxTwa: 175 },
  sym:   { label: ["Symmetric", "Sümmeetriline"],   dmin: 42, dmax: 104, cmin: 0.195, cmax: 0.335, ar: 1.7, minTwa: 108, maxTwa: 180 },
};
const REEF = [1, 0.80, 0.62, 0.45];
const sailOf = (B, k) => {
  const t = SAIL_TYPES[k] || SAIL_TYPES.none;
  const area = k === "none" ? 0 : (B.sails[k] || 0);
  return { ...t, area, dmin: t.dmin + (area ? B.dminAdd : 0) };
};
const sailKeys = (B) => ["none", ...Object.keys(B.sails)];

/* ---------------------------- aerodynamics ------------------------------ */
function foil(alphaDeg, camber, ar) {
  const a = Math.abs(alphaDeg);
  const CLmax = 0.95 + 4.6 * camber;
  const aOpt = 12 + 58 * camber;
  let CL = CLmax * Math.sin(2 * a * d2r);
  if (a > aOpt) CL *= 1 - 0.40 * cl((a - aOpt) / 30, 0, 1);
  if (alphaDeg < 0) { const f = cl(1 + alphaDeg / 7, 0, 1); CL *= f * f; }
  const sep = 1.30 * Math.pow(cl((a - aOpt) / (92 - aOpt), 0, 1), 1.7);
  let CD = 0.032 + (CL * CL) / (Math.PI * ar * 0.88) + sep;
  if (alphaDeg < -2) CD += 0.12 * cl(-alphaDeg / 12, 0, 1);
  return { CL, CD, aOpt };
}
function apparent(tws, twaDeg, bs) {
  const t = Math.abs(twaDeg) * d2r;
  const x = tws * Math.cos(t) + bs, y = tws * Math.sin(t);
  return { aws: Math.hypot(x, y), awa: Math.atan2(y, x) * r2d };
}
function idealTwist(awa, twsKn, sea) {
  return 9 + 0.17 * Math.max(0, awa - 28) + 9 * cl((twsKn - 12) / 16, 0, 1) + 1.4 * sea + (awa > 110 ? 6 : 0);
}
function camberFrac(awa, twsKn, sea) {
  const light = cl((9 - twsKn) / 8, 0, 1), heavy = cl((twsKn - 13) / 14, 0, 1);
  return cl(0.45 + 0.42 * light - 0.42 * heavy + 0.12 * sea + 0.22 * cl((awa - 70) / 70, 0, 1), 0, 1);
}
const idealMainCamber = (awa, twsKn, sea) => 0.070 + 0.105 * camberFrac(awa, twsKn, sea);

/* ------------------------- trim → sail geometry -------------------------- */
function mainGeom(t, B) {
  const c = B.cam;
  const boom = cl((1 - t.mainSheet) * B.boomR - (t.traveller - 0.5) * B.travR, -4, 88);
  const leech = cl(0.75 * t.mainSheet + 0.45 * t.vang + 0.10 * t.traveller, 0, 1);
  const twist = cl(B.twist0 - 26 * leech + (B.ctrl.backstay ? 7 * t.backstay : 0), 0, 44);
  const camber = cl(c.base - c.out * t.outhaul - c.bs * t.backstay - c.cun * t.cunningham
    - c.run * t.runners - c.hal * t.mainHalyard, c.min, c.max);
  const draftPos = cl(0.48 - 0.16 * t.cunningham - 0.10 * t.mainHalyard + 0.10 * t.outhaul, 0.28, 0.62);
  return { boom, leech, twist, camber, draftPos };
}
function headGeom(t, S, aws, B) {
  if (!S.area) return { angle: 0, twist: 0, camber: 0, sag: 0, furl: 1, draftPos: 0.4 };
  const furl = 1 - 0.65 * t.furl;
  const kite = S.ar < 2.2;
  let angle = S.dmin + (S.dmax - S.dmin) * (1 - t.headSheet);
  if (kite) angle = cl(angle + (t.poleHeight - 0.5) * 10, S.dmin, S.dmax + 8);
  const sag = cl((aws * aws * S.area / B.sagK) * (1 - (B.ctrl.backstay ? 0.55 * t.backstay : 0)
    - (B.ctrl.runners ? 0.30 * t.runners : 0)), 0, 1.8);
  const camber = cl(S.cmin + (S.cmax - S.cmin) * (1 - 0.55 * t.headSheet)
    - 0.045 * t.headHalyard + 0.050 * sag - 0.035 * t.carPos, S.cmin * 0.65, S.cmax * 1.3);
  const twist = cl(6 + 34 * t.carPos - 12 * t.headSheet + (kite ? 8 * t.poleHeight : 0), 0, 46);
  const draftPos = cl(0.40 - 0.14 * t.headHalyard + 0.10 * sag, 0.24, 0.58);
  return { angle, twist, camber, sag, furl, draftPos };
}

/* ------------------------------ force balance ---------------------------- */
function forces(st, t, bs, heelGuess) {
  const B = BOATS[st.boat] || BOATS.cr40;
  const twsKn = st.tws / KT;
  const S = sailOf(B, st.headsail);
  const { aws, awa } = apparent(st.tws, st.twa, bs);
  const aa = Math.abs(awa);
  const heel = heelGuess ?? (B.type === "cat" ? 5 : 12);

  const mg = mainGeom(t, B);
  const hg = headGeom(t, S, aws, B);
  const mainA = B.mainA * REEF[st.reef];

  const twIdeal = idealTwist(aa, twsKn, st.seaState);
  const camMIdeal = idealMainCamber(aa, twsKn, st.seaState);
  const cf = camberFrac(aa, twsKn, st.seaState);
  const camHIdeal = S.area ? S.cmin + (S.cmax - S.cmin) * cf : 0;

  const aM = aa - mg.boom;
  const fM = foil(aM, mg.camber, 4.3);
  const eTwM = Math.exp(-Math.pow((mg.twist - twIdeal) / 13, 2) * 0.55);
  const eCaM = Math.exp(-Math.pow((mg.camber - camMIdeal) / 0.042, 2) * 0.5);

  let aH = 0, fH = { CL: 0, CD: 0, aOpt: 0 }, eTwH = 1, eCaH = 1;
  if (S.area) {
    aH = aa - hg.angle;
    fH = foil(aH, hg.camber, S.ar);
    eTwH = Math.exp(-Math.pow((hg.twist - twIdeal) / 13, 2) * 0.55);
    eCaH = Math.exp(-Math.pow((hg.camber - camHIdeal) / ((S.cmax - S.cmin) * 0.5 + 0.02), 2) * 0.5);
  }
  const slotGap = Math.abs(hg.angle - mg.boom);
  const slot = aa < 80 ? 1 - 0.14 * cl(1 - slotGap / 22, 0, 1) : 1;
  const suit = S.area
    ? cl(1 - Math.max(0, S.minTwa - Math.abs(st.twa)) / 25, 0.15, 1) *
      cl(1 - Math.max(0, Math.abs(st.twa) - S.maxTwa) / 30, 0.15, 1)
    : 1;

  const q = 0.5 * RHO_A * aws * aws * Math.cos(heel * d2r);
  const rad = aa * d2r;
  const kM = mainA * eTwM * eCaM;
  const kH = S.area * hg.furl * eTwH * eCaH * slot * suit;
  const driveM = q * kM * (fM.CL * Math.sin(rad) - fM.CD * Math.cos(rad));
  const sideM = q * kM * (fM.CL * Math.cos(rad) + fM.CD * Math.sin(rad));
  const driveH = q * kH * (fH.CL * Math.sin(rad) - fH.CD * Math.cos(rad));
  const sideH = q * kH * (fH.CL * Math.cos(rad) + fH.CD * Math.sin(rad));
  const drive = driveM + driveH, side = sideM + sideH;

  /* stability: ballast (mono) vs beam (cat) */
  const arm = B.rmArm - 1.7 * cl((aa - 60) / 90, 0, 1);
  const HM = Math.abs(side) * arm;
  let heelOut, rmUsed;
  if (B.type === "cat") {
    rmUsed = HM / (B.disp * G * B.rmBeam * B.beam);
    heelOut = cl(rmUsed * B.heelMax, 0, B.heelMax * 1.4);
  } else {
    rmUsed = HM / (B.disp * G * B.GM);
    heelOut = Math.atan(rmUsed) * r2d;
    heelOut = cl(heelOut * (1 + 0.38 * cl(heelOut / 40, 0, 1)), 0, 70);
  }

  const V = Math.max(0.2, bs);
  const Fn = V / Math.sqrt(G * B.lwl);
  const Rf = 0.5 * RHO_W * B.Sw * B.cf * 1.20 * V * V;
  const Rw = Rf * Math.pow(Fn / B.fn0, B.wexp);
  const leeway = Math.min(0.45, Math.abs(side) / (0.5 * RHO_W * B.keelA * V * V * B.keelEff));
  const Ri = Math.abs(side) * Math.tan(leeway);
  const bal = kM / (kM + kH + 1);
  const helm = cl(1.6 + 26 * (bal - 0.52) * B.helmK + 0.14 * heelOut, 0, 15);
  const Rr = 5.5 * helm * helm * (V / 3.5) * (V / 3.5) * (B.disp / 8600);
  const Rheel = Rf * 0.9 * Math.pow(heelOut / B.heelRef, 2.2);
  const waveK = 210 * Math.pow(B.disp / 8600, 0.6) * (B.type === "cat" ? 1.25 : 1);
  const Rwave = waveK * st.seaState * st.seaState * (V / 3.5)
    * Math.exp(-Math.pow((Fn - B.fn0 * 0.95) / 0.22, 2)) * (1 - 0.45 * cl((aa - 110) / 70, 0, 1));
  const surf = (aa > 115 && st.seaState > 0.7 && twsKn > 13)
    ? 210 * Math.pow(B.disp / 8600, 0.5) * (st.seaState - 0.7) * cl((twsKn - 13) / 12, 0, 1) * cl((aa - 115) / 45, 0, 1) : 0;
  const R = Rf + Rw + Ri + Rr + Rheel + Rwave - surf;

  return { drive, side, R, heel: heelOut, rmUsed, aws, awa: aa, aM, aH, fM, fH, mg, hg, mainA, B, S,
    eTwM, eCaM, eTwH, eCaH, slot, suit, helm, leeway: leeway * r2d, twIdeal, camMIdeal, camHIdeal, Fn };
}

function steady(st, t) {
  let heel = 12;
  const net = (bs) => {
    for (let i = 0; i < 3; i++) { const f = forces(st, t, bs, heel); heel += (f.heel - heel) * 0.7; }
    const f = forces(st, t, bs, heel);
    return { v: f.drive - f.R, f };
  };
  let lo = null, hi = null, prev = null, prevBs = 0;
  for (let bs = 0.4; bs <= 14.3; bs += 0.4) {
    const n = net(bs);
    if (prev !== null && prev > 0 && n.v <= 0) { lo = prevBs; hi = bs; }
    prev = n.v; prevBs = bs;
  }
  if (lo === null) {
    const b = prev > 0 ? 14.2 : 0.35;
    return { bs: b, heel, ...forces(st, t, Math.max(0.4, b), heel) };
  }
  let mid = lo;
  for (let i = 0; i < 20; i++) { mid = 0.5 * (lo + hi); if (net(mid).v > 0) lo = mid; else hi = mid; }
  for (let i = 0; i < 8; i++) { const f = forces(st, t, mid, heel); heel += (f.heel - heel) * 0.6; }
  return { bs: mid, heel, ...forces(st, t, mid, heel) };
}

const BASE_TRIM = { mainSheet: 0.80, traveller: 0.50, vang: 0.35, outhaul: 0.50, cunningham: 0.20,
  backstay: 0.30, runners: 0.30, mainHalyard: 0.40, headSheet: 0.75, carPos: 0.35,
  headHalyard: 0.40, furl: 0, poleHeight: 0.50 };

function idealTrim(st, quick) {
  const B = BOATS[st.boat] || BOATS.cr40;
  const twsKn = st.tws / KT, a = Math.abs(st.twa), S = sailOf(B, st.headsail);
  const heavy = cl((twsKn - 13) / 14, 0, 1);
  const awaEst = apparent(st.tws, a, 3.2).awa;
  const twI = idealTwist(awaEst, twsKn, st.seaState);
  const camM = idealMainCamber(awaEst, twsKn, st.seaState);
  const c = B.cam;

  const t = { ...BASE_TRIM };
  t.backstay = B.ctrl.backstay ? cl(0.12 + heavy * 0.85, 0, 1) : 0;
  t.runners = B.ctrl.runners ? cl(0.15 + heavy * 0.80, 0, 1) : 0;
  t.cunningham = cl(heavy * 0.95, 0, 1);
  t.mainHalyard = cl(0.30 + heavy * 0.55, 0, 1);
  t.outhaul = cl((c.base - c.bs * t.backstay - c.cun * t.cunningham - c.run * t.runners
    - c.hal * t.mainHalyard - camM) / c.out, 0, 1);
  const wantBoom = a < 50 ? cl(4 + (a - 32) * 0.22, 2, 9) : cl((a - 42) * 0.63, 5, 80);
  t.mainSheet = cl(1 - wantBoom / B.boomR, 0, 1);
  const leechWant = cl((B.twist0 + 7 * t.backstay - twI) / 26, 0, 1);
  t.vang = cl((leechWant - 0.75 * t.mainSheet - 0.05) / 0.45, 0, 1);
  t.traveller = cl(0.5 + ((1 - t.mainSheet) * B.boomR - wantBoom) / B.travR, 0, 1);
  t.furl = 0;
  if (S.area) {
    const wantAng = a < 55 ? S.dmin + 1.5 : cl(S.dmin + (a - 48) * 0.60, S.dmin, S.dmax);
    t.headSheet = cl(1 - (wantAng - S.dmin) / Math.max(1, S.dmax - S.dmin), 0, 1);
    t.carPos = cl((twI - 6 + 12 * t.headSheet - (S.ar < 2.2 ? 4 : 0)) / 34, 0, 1);
    t.poleHeight = cl(0.25 + (a - 100) / 110, 0, 1);
    for (let k = 0; k < (quick ? 1 : 3); k++) {
      const r = steady(st, t);
      t.headHalyard = cl(t.headHalyard + (r.hg.camber - r.camHIdeal) / 0.045, 0, 1);
      t.carPos = cl(t.carPos + (r.twIdeal - r.hg.twist) / 34, 0, 1);
    }
  }
  for (let k = 0; k < (quick ? 1 : 2); k++) {
    const r = steady(st, t);
    t.outhaul = cl(t.outhaul + (r.mg.camber - r.camMIdeal) / c.out, 0, 1);
    t.vang = cl(t.vang + (r.mg.twist - r.twIdeal) / 26 / 0.45, 0, 1);
  }
  return t;
}

function bestHeadsail(twaAbs, twsKn, boatKey) {
  const B = BOATS[boatKey] || BOATS.cr40;
  let best = "none", score = -1;
  for (const k of Object.keys(B.sails)) {
    const S = sailOf(B, k);
    if (twaAbs < S.minTwa || twaAbs > S.maxTwa) continue;
    let sc = S.area;
    if (S.ar > 2.2 && twsKn > 18 && twaAbs < 60) sc *= 0.7;
    if (k === "genoa" && twsKn > 17) sc *= 0.55;
    if (k === "code0" && twsKn > 20) sc *= 0.5;
    if ((k === "asym" || k === "sym") && twsKn > 26) sc *= 0.4;
    if (sc > score) { score = sc; best = k; }
  }
  return best;
}
function bestReef(twsKn, twaAbs, boatKey) {
  const B = BOATS[boatKey] || BOATS.cr40;
  const eff = twsKn * (twaAbs < 70 ? 1 : 0.82), w = B.reefWind;
  return eff > w[2] ? 3 : eff > w[1] ? 2 : eff > w[0] ? 1 : 0;
}
function buildPolar(twsMs, sea, boatKey) {
  const out = [], twsKn = twsMs / KT;
  for (let a = 28; a <= 180; a += 6) {
    const st = { tws: twsMs, twa: a, seaState: sea, boat: boatKey,
      headsail: bestHeadsail(a, twsKn, boatKey), reef: bestReef(twsKn, a, boatKey) };
    out.push({ twa: a, bs: steady(st, idealTrim(st, true)).bs });
  }
  return out;
}

/* ------------------------------ language -------------------------------- */
const T = {
  title: ["TRIM", "TRIM"],
  sub: ["Sail trim trainer · 12.3 m cruiser-racer", "Purjede trimmimise treenar · 12,3 m kruiiser-võistleja"],
  plan: ["Plan", "Pealt"], cockpit: ["Cockpit", "Kokpit"], section: ["Sections", "Lõiked"], threeD: ["3D", "3D"],
  dragHint: ["drag to orbit", "lohista vaate pööramiseks"], resetView: ["Reset", "Lähtesta"],
  proL: ["Pro", "Pro"], lockedL: ["Pro feature", "Pro funktsioon"],
  payTitle: ["Unlock Trim Pro", "Ava Trim Pro"],
  payBody: ["Easy Trim is free forever: the 40 ft cruiser-racer, the cockpit and plan views, the core trim controls and live target speed. Pro adds the detailed views and everything you can change about the boat and the day.",
            "Easy Trim on igavesti tasuta: 40-jalane kruiiser-võistleja, kokpiti- ja pealtvaade, põhilised trimmiseaded ja sihtkiirus reaalajas. Pro lisab detailvaated ja kõik, mida saab paadi ja ilma juures muuta."],
  payList: [["3D rig view and sail cutaway sections", "Five boats including two catamarans",
             "Full rig: backstay, runners, cunningham, halyards, furling, pole",
             "Gusts, wind shifts, sea state and current", "Live polar diagram and ideal-trim marks"],
            ["3D taglasevaade ja purjede ristlõiked", "Viis paati, sh kaks katamaraani",
             "Kogu taglas: ahterstaag, backstaagid, cunningham, fallid, kerimine, poom",
             "Puhangud, tuulepöörded, lainetus ja hoovus", "Polaardiagramm ja ideaaltrimmi märgid"]],
  upgradeL: ["Upgrade", "Uuenda"], laterL: ["Not now", "Hiljem"],
  boatL: ["Boat", "Paat"], beamL: ["beam", "laius"], sailAreaL: ["upwind SA", "purjepind"],
  catL: ["catamaran", "katamaraan"], rmL: ["RM used", "Kreenimoment"],
  vHelm: ["Helm", "Rooli juurest"], vAstern: ["Astern", "Ahtrist"], vLee: ["Leeward", "Allatuule"],
  vBow: ["Bow", "Vöörist"], vAbove: ["Above", "Ülevalt"], camera: ["Camera", "Kaamera"],
  draft: ["Draft", "Kumeruse koht"], area: ["Area", "Pind"], boomAng: ["Boom", "Poom"], sheetAng: ["Sheet angle", "Soodi nurk"],
  polarT: ["Polar", "Polaar"],
  boatSpeed: ["Boat speed", "Paadi kiirus"], target: ["Target", "Siht"], ofTarget: ["of target", "sihist"],
  vmg: ["VMG", "VMG"], heel: ["Heel", "Kreen"], leeway: ["Leeway", "Triiv"], helm: ["Helm", "Rooliraskus"],
  awa: ["AWA", "Näiv nurk"], aws: ["AWS", "Näiv kiirus"], twa: ["TWA", "Tegelik nurk"], tws: ["TWS", "Tuule kiirus"],
  sog: ["SOG", "SOG"],
  coach: ["Coach", "Treener"], onTarget: ["Trim is on the money. Hold it.", "Trimm on paigas. Hoia nii."],
  controls: ["Controls", "Juhtseadmed"],
  gMain: ["Mainsail", "Suurpuri"], gHead: ["Headsail", "Eespuri"], gRig: ["Rig & reefing", "Taglas ja riifid"],
  gEnv: ["Wind & water", "Tuul ja vesi"],
  autoTrim: ["Set optimal trim", "Sea optimaalne trimm"], reset: ["Reset trim", "Lähtesta trimm"],
  showIdeal: ["Show ideal marks", "Näita ideaalmärke"], run: ["Run", "Käigus"], pause: ["Pause", "Paus"],
  tack: ["Tack / gybe", "Halss / gaid"],
  seaState: ["Sea state", "Lainetus"], gusts: ["Gusts", "Puhangud"], shifts: ["Shifts", "Pöörded"],
  current: ["Current", "Hoovus"], currentDir: ["Current from", "Hoovus suunast"],
  reefL: ["Reef", "Riif"], headsailL: ["Headsail", "Eespuri"], full: ["Full", "Täis"],
  camber: ["Camber", "Kumerus"], twist: ["Twist", "Väänd"], entry: ["AoA", "Ründenurk"],
  sag: ["Forestay sag", "Vöörstaagi lõtk"], luffing: ["LUFFING", "LEHVIB"], stalled: ["STALLED", "SEISKUNUD"],
  attached: ["FLOWING", "VOOLAB"], head: ["Head", "Ülemine"], mid: ["Mid", "Keskmine"], foot: ["Foot", "Alumine"],
  windward: ["windward", "tuulepoolne"], leeward: ["leeward", "allatuule"],
  tellt: ["Telltales", "Niidid"], notes: ["Reading the numbers", "Numbrite lugemine"],
  mainSheet: ["Mainsheet", "Suurpurje soot"], traveller: ["Traveller", "Traveller"],
  vang: ["Vang", "Vang"], outhaul: ["Outhaul", "Outhaul"], cunningham: ["Cunningham", "Cunningham"],
  mainHalyard: ["Main halyard", "Suurpurje fall"], headSheet: ["Headsail sheet", "Eespurje soot"],
  carPos: ["Sheet car", "Soodi kelk"], headHalyard: ["Luff tension", "Esiliigi pinge"],
  furl: ["Furl", "Kerimine"], poleHeight: ["Pole / tack line", "Poom / halsiliin"],
  backstay: ["Backstay", "Ahterstaag"], runners: ["Runners", "Jooksvad backstaagid"],
  eased: ["eased", "lõdev"], hard: ["hard on", "pingul"], fwd: ["fwd", "ette"], aft: ["aft", "taha"],
  down: ["down", "alla"], up: ["up", "üles"], low: ["low", "madal"], high: ["high", "kõrge"],
};
const HINT = {
  mainSheet: { up: ["Trim the mainsheet on", "Pinguta suurpurje soot"], down: ["Ease the mainsheet", "Lase suurpurje soot lõdvemaks"] },
  traveller: { up: ["Traveller up to windward", "Traveller tuule poole"], down: ["Traveller down to leeward", "Traveller allatuule poole"] },
  vang: { up: ["Load the vang — close the upper leech", "Pinguta vangi — sulge ülemine ahterliik"], down: ["Ease the vang — let the top twist off", "Lase vang lõdvemaks — lase ülemine osa väänduda"] },
  outhaul: { up: ["Tension the outhaul — flatten the foot", "Pinguta outhauli — lamedam alusliik"], down: ["Ease the outhaul — depth low down", "Lase outhaul lõdvemaks — rohkem kumerust all"] },
  cunningham: { up: ["Pull the cunningham — draft forward", "Pinguta cunninghami — kumerus ettepoole"], down: ["Ease the cunningham", "Lase cunningham lõdvemaks"] },
  mainHalyard: { up: ["More main halyard tension", "Pinguta suurpurje falli"], down: ["Ease the main halyard", "Lase suurpurje fall lõdvemaks"] },
  backstay: { up: ["More backstay — bend the mast, flatten the main", "Rohkem ahterstaagi — painuta masti, lamesta suurpuri"], down: ["Ease the backstay — power up", "Lase ahterstaag lõdvemaks — rohkem jõudu"] },
  runners: { up: ["Load the runners — take out forestay sag", "Pinguta backstaagid — vähem vöörstaagi lõtku"], down: ["Ease the runners — let the forestay sag", "Lase backstaagid lõdvemaks"] },
  headSheet: { up: ["Sheet the headsail on", "Pinguta eespurje soot"], down: ["Ease the headsail sheet", "Lase eespurje soot lõdvemaks"] },
  carPos: { up: ["Car aft — open the leech", "Kelk taha — ava ahterliik"], down: ["Car forward — close the leech", "Kelk ette — sulge ahterliik"] },
  headHalyard: { up: ["More luff tension — draft forward", "Pinguta esiliiki — kumerus ettepoole"], down: ["Ease the luff — let the draft aft", "Lase esiliik lõdvemaks"] },
  furl: { up: ["Roll away some headsail", "Keri eespurje osaliselt kokku"], down: ["Unroll the headsail", "Keri eespuri lahti"] },
  poleHeight: { up: ["Raise the pole / ease the tack line", "Tõsta poomi / lase halsiliin lõdvemaks"], down: ["Lower the pole / pull the tack line down", "Langeta poomi / pinguta halsiliini"] },
};
const CTRL_META = {
  mainSheet: { grp: "main", lo: T.eased, hi: T.hard },
  traveller: { grp: "main", lo: T.down, hi: T.up },
  vang: { grp: "main", lo: T.eased, hi: T.hard },
  outhaul: { grp: "main", lo: T.eased, hi: T.hard },
  cunningham: { grp: "main", lo: T.eased, hi: T.hard },
  mainHalyard: { grp: "main", lo: T.eased, hi: T.hard },
  headSheet: { grp: "head", lo: T.eased, hi: T.hard },
  carPos: { grp: "head", lo: T.fwd, hi: T.aft },
  headHalyard: { grp: "head", lo: T.eased, hi: T.hard },
  furl: { grp: "head", lo: T.full, hi: T.eased },
  poleHeight: { grp: "head", lo: T.low, hi: T.high },
  backstay: { grp: "rig", lo: T.eased, hi: T.hard },
  runners: { grp: "rig", lo: T.eased, hi: T.hard },
};

/* ------------------------------ helpers --------------------------------- */
function devState(dev) { return dev > 6 ? "stall" : dev < -6 ? "luff" : "flow"; }
function sectionAt(h, st, t, bs, heel, tIdeal) {
  // local wind gradient + sail twist at relative height h (0 foot … 1 head)
  const shear = 0.80 + 0.42 * Math.pow(h, 0.55);
  const local = apparent(st.tws * shear, st.twa, bs);
  const B = BOATS[st.boat] || BOATS.cr40;
  const S = sailOf(B, st.headsail);
  const hg = headGeom(t, S, local.aws, B), mg = mainGeom(t, B);
  const hAng = hg.angle + hg.twist * h, mAng = mg.boom + mg.twist * h;
  const aH = local.awa - hAng, aM = local.awa - mAng;
  let devH = 0, devM = 0;
  if (tIdeal) {
    const hgi = headGeom(tIdeal, S, local.aws, B), mgi = mainGeom(tIdeal, B);
    devH = (hgi.angle + hgi.twist * h) - hAng;
    devM = (mgi.boom + mgi.twist * h) - mAng;
  }
  return { h, awa: local.awa, aws: local.aws, hAng, mAng, aH, aM, devH, devM,
    stH: S.area ? devState(devH) : "flow", stM: devState(devM),
    camH: hg.camber, camM: mg.camber, dpH: hg.draftPos, dpM: mg.draftPos };
}
const fmt = (v, n = 1) => (isFinite(v) ? v.toFixed(n) : "–");

/* ============================== component ================================ */
const FREE_BOAT = "cr40";
const FREE_VIEWS = ["cockpit", "plan"];
const FREE_CTRL = ["mainSheet", "traveller", "vang", "outhaul", "headSheet", "carPos"];

export default function App({ tier = "pro", onUpgrade = null }) {
  const PRO = tier === "pro";
  const [payOpen, setPayOpen] = useState(false);
  const gate = (ok) => { if (PRO) { ok(); return true; } setPayOpen(true); return false; };
  const [lang, setLang] = useState(0); // 0 en, 1 et
  const L = (pair) => pair[lang];

  const [env, setEnv] = useState({ tws: 12, twa: 45, seaState: 0.5, gust: 0.35, shift: 0.3,
    gustOn: true, shiftOn: true, current: 0, currentDir: 90 });
  const [rig, setRig] = useState({ boat: FREE_BOAT, headsail: "genoa", reef: 0 });
  const B = BOATS[rig.boat];
  const pickBoat = (k) => setRig((p) => {
    const nb = BOATS[k];
    const hs = nb.sails[p.headsail] ? p.headsail : (nb.sails.genoa ? "genoa" : Object.keys(nb.sails)[0]);
    return { boat: k, headsail: hs, reef: p.reef };
  });
  const [trim, setTrim] = useState({ ...BASE_TRIM });
  const [view, setView] = useState(tier === "pro" ? "three" : "cockpit");
  const [activeCtrl, setActiveCtrl] = useState(null);
  const actTimer = useRef(null);
  const touchCtrl = useCallback((k) => {
    setActiveCtrl(k);
    clearTimeout(actTimer.current);
    actTimer.current = setTimeout(() => setActiveCtrl(null), 2600);
  }, []);
  const [tab, setTab] = useState("main");
  const [running, setRunning] = useState(true);
  const [showIdeal, setShowIdeal] = useState(false);
  const [tackSign, setTackSign] = useState(1);
  const HELM_CAM = { az: 203, el: 14, dist: 28 };
  const [cam3d, setCam3d] = useState(HELM_CAM);
  const [quality, setQuality] = useState(() =>
    (typeof navigator !== "undefined" && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
    || (typeof window !== "undefined" && window.innerWidth < 760) ? "low" : "high");
  const preset = (k) => {
    const lee = tackSign > 0 ? 0 : 180;
    const P = { helm: HELM_CAM, astern: { az: 270, el: 12, dist: 27 },
      lee: { az: lee, el: 7, dist: 32 }, bow: { az: 90, el: 11, dist: 26 },
      above: { az: 215, el: 58, dist: 31 } };
    setCam3d(P[k]);
  };
  const zoom = (dz) => setCam3d((c) => ({ ...c, dist: cl(c.dist + dz, 15, 60) }));

  const refs = useRef({ trim, env, rig, running, tackSign, PRO });
  refs.current = { trim, env, rig, running, tackSign, PRO };

  const sim = useRef({ bs: 2.0, heel: 5, gx: 0, sx: 0, t: 0 });
  const [live, setLive] = useState(null);

  /* ---- effective state (wind over water, gust/shift applied) ---- */
  const effState = useCallback(() => {
    const { env: e, rig: r } = refs.current;
    const s = sim.current;
    const pro = refs.current.PRO;
    const twsInst = Math.max(0.3, e.tws * (1 + (pro ? s.gx : 0))) * KT;
    const twaInst = cl(Math.abs(e.twa) + (pro ? s.sx : 0), 5, 180);
    // current: shift wind over water
    let tws = twsInst, twa = twaInst;
    if (pro && e.current > 0.05) {
      const cur = e.current * KT, ca = e.currentDir * d2r;
      const Wx = -tws * Math.cos(twa * d2r), Wy = -tws * Math.sin(twa * d2r);
      const Cx = -cur * Math.cos(ca), Cy = -cur * Math.sin(ca);
      const Rx = Wx - Cx, Ry = Wy - Cy;
      tws = Math.hypot(Rx, Ry);
      twa = cl(Math.atan2(-Ry, -Rx) * r2d, 3, 180);
    }
    return { tws, twa, seaState: pro ? e.seaState : 0, boat: r.boat, headsail: r.headsail, reef: r.reef };
  }, []);

  /* ---- simulation loop ---- */
  useEffect(() => {
    let raf, lastT = performance.now(), acc = 0;
    const step = (now) => {
      raf = requestAnimationFrame(step);
      let dt = Math.min(0.06, (now - lastT) / 1000); lastT = now;
      const s = sim.current, e = refs.current.env;
      s.t += dt;
      if (refs.current.running) {
        // Ornstein–Uhlenbeck gust & shift
        const rn = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
        if (e.gustOn) s.gx += (-s.gx / 9) * dt + e.gust * 0.30 * Math.sqrt(dt) * rn();
        else s.gx += (-s.gx / 2) * dt;
        if (e.shiftOn) s.sx += (-s.sx / 22) * dt + e.shift * 9 * Math.sqrt(dt) * rn();
        else s.sx += (-s.sx / 3) * dt;
        s.gx = cl(s.gx, -0.45, 0.9); s.sx = cl(s.sx, -22, 22);

        const st = effState();
        const f = forces(st, refs.current.trim, s.bs, s.heel);
        s.bs = cl(s.bs + (f.drive - f.R) / (f.B.disp * 1.28) * dt, 0.02, 16);
        s.heel += (f.heel - s.heel) * Math.min(1, dt / 0.85);
      }
      acc += dt;
      if (acc > 0.07) {
        acc = 0;
        const st = effState();
        const f = forces(st, refs.current.trim, s.bs, s.heel);
        setLive({ st, f, bs: s.bs, heel: s.heel, gx: s.gx, sx: s.sx, t: s.t });
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [effState]);

  /* ---- ideal trim + target speed (debounced on settings) ---- */
  const baseState = useMemo(() => ({ tws: env.tws * KT, twa: Math.abs(env.twa), seaState: PRO ? env.seaState : 0,
    boat: rig.boat, headsail: rig.headsail, reef: rig.reef }),
    [env.tws, env.twa, env.seaState, rig.boat, rig.headsail, rig.reef]);

  const ideal = useMemo(() => idealTrim(baseState), [baseState]);
  const targetRun = useMemo(() => steady(baseState, ideal), [baseState, ideal]);

  const [polar, setPolar] = useState([]);
  useEffect(() => {
    const id = setTimeout(() => setPolar(buildPolar(env.tws * KT, env.seaState, rig.boat)), 260);
    return () => clearTimeout(id);
  }, [env.tws, env.seaState, rig.boat]);

  /* ---- coaching ---- */
  const hints = useMemo(() => {
    if (!live) return [];
    const { st, f, bs, heel } = live;
    const base = f.drive;
    const out = [];
    for (const k of Object.keys(CTRL_META)) {
      if (!f.S.area && CTRL_META[k].grp === "head") continue;
      if (k === "poleHeight" && f.S.ar > 2.2) continue;
      if (CTRL_META[k].grp === "rig" && !f.B.ctrl[k]) continue;
      const delta = ideal[k] - trim[k];
      if (Math.abs(delta) < 0.06) continue;
      const test = { ...trim, [k]: ideal[k] };
      const g = forces(st, test, bs, heel).drive - base;
      if (g <= base * 0.004) continue;
      out.push({ k, gain: g / Math.max(1, base), dir: delta > 0 ? "up" : "down", mag: Math.abs(delta) });
    }
    out.sort((a, b) => b.gain - a.gain);
    const extra = [];
    const twsKn = st.tws / KT, aa = Math.abs(st.twa);
    const br = bestReef(twsKn, aa, st.boat), bh = bestHeadsail(aa, twsKn, st.boat);
    if (br > rig.reef) extra.push(lang ? `Võta riif sisse — praegu ${["täis", "1 riif", "2 riifi", "3 riifi"][rig.reef]}` : `Put a reef in — you are carrying ${["full main", "1 reef", "2 reefs", "3 reefs"][rig.reef]}`);
    if (br < rig.reef) extra.push(lang ? "Raputa riif välja — purjepinda on liiga vähe" : "Shake out a reef — you are under-canvassed");
    if (bh !== rig.headsail && f.suit < 0.85) extra.push(lang ? `Vaheta eespuri: ${L(SAIL_TYPES[bh].label)}` : `Change headsail: ${L(SAIL_TYPES[bh].label)}`);
    if (f.rmUsed > 0.85 && f.B.type === "cat") extra.push(lang
      ? "Kreenimoment peaaegu täis — lase traveller alla või riifi (kere tõusmise oht)"
      : "Righting moment nearly used up — drop the traveller or reef (hull-flying risk)");
    return { list: out.slice(0, 3), extra };
  }, [live, ideal, trim, rig, lang]); // eslint-disable-line

  const effectFor = (k) => {
    if (!live) return "";
    const { mg, hg } = live.f;
    const pc = (x) => `${(x * 100).toFixed(1)}%`;
    switch (k) {
      case "mainSheet": case "traveller": return `${L(T.boomAng)} ${mg.boom.toFixed(0)}°`;
      case "vang": return `${L(T.twist)} ${mg.twist.toFixed(0)}°`;
      case "outhaul": return `${L(T.camber)} ${pc(mg.camber)}`;
      case "cunningham": case "mainHalyard": return `${L(T.draft)} ${pc(mg.draftPos)}`;
      case "backstay": return `${L(T.camber)} ${pc(mg.camber)} · ${L(T.sag)} ${hg.sag.toFixed(2)} m`;
      case "runners": return `${L(T.sag)} ${hg.sag.toFixed(2)} m`;
      case "headSheet": case "poleHeight": return `${L(T.sheetAng)} ${hg.angle.toFixed(0)}°`;
      case "carPos": return `${L(T.twist)} ${hg.twist.toFixed(0)}°`;
      case "headHalyard": return `${L(T.draft)} ${pc(hg.draftPos)} · ${pc(hg.camber)}`;
      case "furl": return `${L(T.area)} ${(hg.furl * 100).toFixed(0)}%`;
      default: return "";
    }
  };
  const focusGrp = activeCtrl ? (CTRL_META[activeCtrl] ? CTRL_META[activeCtrl].grp : null) : null;
  const focus = focusGrp === "head" ? "head" : focusGrp === "main" ? "main" : null;

  const setT = (k, v) => setTrim((p) => ({ ...p, [k]: v }));
  const autoTrim = () => setTrim({ ...ideal });

  /* ---- derived readouts ---- */
  const bsKn = live ? live.bs / KT : 0;
  const tgtKn = targetRun.bs / KT;
  const pct = tgtKn > 0.2 ? cl((bsKn / tgtKn) * 100, 0, 130) : 0;
  const twaNow = live ? live.st.twa : env.twa;
  const vmg = live ? (live.bs / KT) * Math.cos(twaNow * d2r) : 0;
  const sections = live ? [0.85, 0.5, 0.15].map((h) => sectionAt(h, live.st, trim, live.bs, live.heel, ideal)) : [];
  const idealF = live ? forces(live.st, ideal, live.bs, live.heel) : null;
  const devM = idealF ? idealF.mg.boom - live.f.mg.boom : 0;
  const devH = idealF ? idealF.hg.angle - live.f.hg.angle : 0;

  const pctColor = pct > 98 ? "var(--teal)" : pct > 93 ? "var(--ink)" : pct > 85 ? "var(--amber)" : "var(--magenta)";

  return (
    <div className="app">
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Barlow+Semi+Condensed:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
:root{
  --paper:#E7EDE9; --panel:#F5F8F5; --sea:#B7D2D6; --deep:#9BC0C6;
  --ink:#11242C; --ink60:rgba(17,36,44,.60); --ink30:rgba(17,36,44,.28);
  --sand:#E7D9B4; --magenta:#BE2478; --teal:#0C7B85; --amber:#C77E12;
  --line:rgba(17,36,44,.16);
}
*{box-sizing:border-box}
.app{background:var(--paper);color:var(--ink);min-height:100%;padding:10px 10px 34px;
  font-family:'Barlow Semi Condensed',system-ui,sans-serif;font-size:15px;line-height:1.35;}
.mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;}
.disp{font-family:'Bricolage Grotesque','Barlow Semi Condensed',sans-serif;font-weight:800;letter-spacing:-.02em;}
.hdr{display:flex;align-items:baseline;gap:10px;margin-bottom:8px;flex-wrap:wrap}
.hdr h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:30px;margin:0;letter-spacing:-.04em}
.hdr .s{font-size:13px;color:var(--ink60);letter-spacing:.02em}
.langbtn{margin-left:auto;display:flex;gap:0;border:1px solid var(--line);border-radius:2px;overflow:hidden}
.langbtn button{font:inherit;font-size:12px;letter-spacing:.08em;padding:3px 9px;background:transparent;border:0;color:var(--ink60);cursor:pointer}
.langbtn button.on{background:var(--ink);color:var(--paper)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:3px;margin-bottom:8px}
.panel>.ph{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--line)}
.ph .lbl{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink60)}
.tabs{display:flex;gap:0;margin-left:auto}
.tabs button, .segs button{font:inherit;font-size:12px;letter-spacing:.06em;text-transform:uppercase;
  padding:3px 8px;border:1px solid var(--line);border-right:0;background:transparent;color:var(--ink60);cursor:pointer}
.tabs button:last-child,.segs button:last-child{border-right:1px solid var(--line)}
.tabs button.on,.segs button.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.segs{display:flex;flex-wrap:wrap;gap:0;padding:8px 10px}
.stage{position:relative;background:var(--panel)}
.readouts{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line)}
.ro{background:var(--panel);padding:6px 8px}
.ro .k{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink60)}
.ro .v{font-family:'IBM Plex Mono',monospace;font-size:19px;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.15}
.ro .u{font-size:11px;color:var(--ink60);margin-left:2px}
.big{grid-column:span 2}
.big .v{font-size:31px}
.bar{height:5px;background:var(--ink30);border-radius:0;overflow:hidden;margin-top:4px}
.bar i{display:block;height:100%}
.ctl{padding:7px 10px 3px;border-bottom:1px solid var(--line)}
.ctl:last-child{border-bottom:0}
.ctl .row{display:flex;align-items:baseline;gap:6px;font-size:13px}
.ctl .nm{font-weight:600;letter-spacing:.01em}
.ctl .end{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--ink60)}
.track{position:relative;padding-top:2px}
.track input[type=range]{width:100%;margin:0;height:26px;background:transparent;-webkit-appearance:none;appearance:none;display:block}
.track input[type=range]::-webkit-slider-runnable-track{height:3px;background:var(--ink30)}
.track input[type=range]::-moz-range-track{height:3px;background:var(--ink30)}
.track input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;
  background:var(--panel);border:2px solid var(--ink);margin-top:-10px;cursor:pointer}
.track input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:var(--panel);border:2px solid var(--ink);cursor:pointer}
.track .tick{position:absolute;top:9px;width:2px;height:12px;background:var(--magenta);pointer-events:none;transform:translateX(-1px)}
.hint{display:flex;gap:8px;align-items:flex-start;padding:6px 10px;border-bottom:1px solid var(--line);font-size:14px}
.hint:last-child{border-bottom:0}
.hint .g{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--magenta);min-width:38px;padding-top:2px}
.good{padding:8px 10px;font-size:14px;color:var(--teal)}
.pillrow{display:flex;flex-wrap:wrap;gap:5px;padding:8px 10px}
.pill{font:inherit;font-size:12px;letter-spacing:.04em;padding:4px 9px;border:1px solid var(--line);
  background:transparent;color:var(--ink60);cursor:pointer;border-radius:2px}
.pill.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.pill.warn{border-color:var(--magenta);color:var(--magenta)}
.foot{font-size:12.5px;color:var(--ink60);padding:2px 2px 0;max-width:640px}
.grid2{display:grid;grid-template-columns:1fr;gap:8px}
@media(min-width:760px){ .grid2{grid-template-columns:1.05fr .95fr} }
.chk{display:flex;align-items:center;gap:7px;font-size:13px;padding:4px 10px}
.chk input{width:17px;height:17px;accent-color:#11242C}
svg{display:block;width:100%;height:auto}
.stage{position:relative;touch-action:pan-y;min-height:180px}
.loading{padding:40px 12px;color:var(--ink30);font-size:22px}
.hud{position:absolute;left:8px;top:6px;display:flex;gap:12px;align-items:flex-end;pointer-events:none}
.hud .n{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;line-height:1}
.hud .b{font-size:26px;font-weight:500}
.hud .p{font-size:19px;font-weight:500}
.hud .k{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink60);display:block;margin-bottom:2px}
.tabs button.lock,.pill.lock{color:var(--magenta);border-color:rgba(190,36,120,.45)}
.lockrow{opacity:.62;cursor:pointer}
.lockrow .end{color:var(--magenta)}
.lockpanel{display:flex;align-items:center;justify-content:center;height:150px;color:var(--magenta);
  font-size:13px;letter-spacing:.04em;cursor:pointer;
  background:repeating-linear-gradient(135deg,transparent,transparent 9px,rgba(190,36,120,.05) 9px,rgba(190,36,120,.05) 18px)}
.modal{position:fixed;inset:0;background:rgba(17,36,44,.55);display:flex;align-items:center;
  justify-content:center;padding:16px;z-index:40}
.sheet{background:var(--panel);border:1px solid var(--ink);border-radius:3px;max-width:430px;padding:16px 18px}
.sheet h2{margin:0 0 6px;font-size:22px}
.sheet p{margin:0 0 10px;font-size:14px;color:var(--ink60)}
.sheet ul{margin:0;padding-left:18px;font-size:14px}
.sheet li{margin-bottom:4px}
.specs{padding:0 10px 8px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink60)}
.camrow{padding:5px 8px;gap:4px;border-top:1px solid var(--line)}
.camrow .pill{padding:3px 8px;font-size:11.5px}
.eff{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--magenta)}
.ctl.act{background:rgba(190,36,120,.06);box-shadow:inset 3px 0 0 var(--magenta)}
@media(max-width:759px){
  .stagewrap{position:sticky;top:0;z-index:6;background:var(--paper);padding-bottom:4px;margin-bottom:4px}
  .stagewrap .panel{margin-bottom:0}
  .stage{height:44vh;min-height:230px}
  .stage svg{height:100%}
  .readouts{grid-template-columns:repeat(3,1fr)}
}
.tl{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em}
      `}</style>

      <div className="hdr">
        <h1>{L(T.title)}</h1>
        <span className="s">{L(T.sub)}</span>
        <span className="langbtn">
          <button className={lang === 0 ? "on" : ""} onClick={() => setLang(0)}>EN</button>
          <button className={lang === 1 ? "on" : ""} onClick={() => setLang(1)}>ET</button>
        </span>
      </div>

      <div className="grid2">
        <div>
          {/* ---------------- stage ---------------- */}
          <div className="stagewrap">
            <div className="panel">
              <div className="ph">
                <span className="tabs" style={{ marginLeft: 0 }}>
                  <button className={(view === "three" ? "on" : "") + (PRO ? "" : " lock")}
                    onClick={() => gate(() => setView("three"))}>{L(T.threeD)}{PRO ? "" : " ●"}</button>
                  <button className={(view === "section" ? "on" : "") + (PRO ? "" : " lock")}
                    onClick={() => gate(() => setView("section"))}>{L(T.section)}{PRO ? "" : " ●"}</button>
                  <button className={view === "cockpit" ? "on" : ""} onClick={() => setView("cockpit")}>{L(T.cockpit)}</button>
                  <button className={view === "plan" ? "on" : ""} onClick={() => setView("plan")}>{L(T.plan)}</button>
                </span>
              </div>
              <div className="stage">
                {!live && <div className="loading">…</div>}
                {live && view === "three" && <ThreeDView live={live} trim={trim} ideal={ideal} L={L} tack={tackSign} focus={focus} reef={rig.reef} phase={live.t} cam={cam3d} setCam={setCam3d} quality={quality} />}
                {live && view === "section" && <SectionView s={sections} live={live} L={L} trim={trim} tack={tackSign} />}
                {live && view === "plan" && <PlanView live={live} trim={trim} L={L} tack={tackSign} devM={devM} devH={devH} />}
                {live && view === "cockpit" && <CockpitView live={live} s={sections} L={L} tack={tackSign} devM={devM} devH={devH} />}
                {live && <div className="hud">
                  <span><span className="k">{L(T.boatSpeed)}</span><span className="n b">{fmt(bsKn, 2)}</span></span>
                  <span><span className="k">{L(T.target)} %</span><span className="n p" style={{ color: pctColor }}>{fmt(pct, 0)}</span></span>
                  <span><span className="k">{L(T.heel)}</span><span className="n p">{fmt(live.heel, 0)}°</span></span>
                </div>}
              </div>
              {view === "three" && (
                <div className="pillrow camrow">
                  <button className="pill" onClick={() => preset("helm")}>{L(T.vHelm)}</button>
                  <button className="pill" onClick={() => preset("astern")}>{L(T.vAstern)}</button>
                  <button className="pill" onClick={() => preset("lee")}>{L(T.vLee)}</button>
                  <button className="pill" onClick={() => preset("bow")}>{L(T.vBow)}</button>
                  <button className="pill" onClick={() => preset("above")}>{L(T.vAbove)}</button>
                  <button className="pill" onClick={() => zoom(-5)}>−</button>
                  <button className="pill" onClick={() => zoom(5)}>+</button>
                  <button className="pill on" onClick={() => setCam3d(HELM_CAM)}>{L(T.resetView)}</button>
                </div>
              )}
            </div>
          </div>

          {/* ---------------- readouts ---------------- */}
          <div className="panel">
            <div className="readouts">
              <div className="ro big">
                <div className="k">{L(T.boatSpeed)}</div>
                <div className="v">{fmt(bsKn, 2)}<span className="u">kn</span></div>
                <div className="bar"><i style={{ width: `${cl(pct, 0, 100)}%`, background: pctColor }} /></div>
              </div>
              <div className="ro">
                <div className="k">{L(T.target)}</div>
                <div className="v" style={{ color: "var(--magenta)" }}>{fmt(tgtKn, 2)}<span className="u">kn</span></div>
              </div>
              <div className="ro">
                <div className="k">% {L(T.ofTarget)}</div>
                <div className="v" style={{ color: pctColor }}>{fmt(pct, 0)}<span className="u">%</span></div>
              </div>
              <div className="ro"><div className="k">{L(T.twa)}</div><div className="v">{fmt(twaNow, 0)}<span className="u">°</span></div></div>
              <div className="ro"><div className="k">{L(T.awa)}</div><div className="v">{fmt(live ? live.f.awa : 0, 0)}<span className="u">°</span></div></div>
              <div className="ro"><div className="k">{L(T.aws)}</div><div className="v">{fmt(live ? live.f.aws / KT : 0, 1)}<span className="u">kn</span></div></div>
              <div className="ro"><div className="k">{L(T.tws)}</div><div className="v">{fmt(live ? live.st.tws / KT : 0, 1)}<span className="u">kn</span></div></div>
              <div className="ro"><div className="k">{L(T.heel)}</div>
                <div className="v" style={{ color: live && live.heel > 27 ? "var(--magenta)" : "inherit" }}>{fmt(live ? live.heel : 0, 0)}<span className="u">°</span></div></div>
              <div className="ro"><div className="k">{L(T.vmg)}</div><div className="v">{fmt(vmg, 2)}<span className="u">kn</span></div></div>
              <div className="ro"><div className="k">{L(T.leeway)}</div><div className="v">{fmt(live ? live.f.leeway : 0, 1)}<span className="u">°</span></div></div>
              <div className="ro"><div className="k">{L(T.rmL)}</div>
                <div className="v" style={{ color: live && live.f.rmUsed > 0.85 ? "var(--magenta)" : "inherit" }}>
                  {fmt(live ? live.f.rmUsed * 100 : 0, 0)}<span className="u">%</span></div></div>
              <div className="ro"><div className="k">{L(T.helm)}</div>
                <div className="v" style={{ color: live && live.f.helm > 6 ? "var(--amber)" : "inherit" }}>{fmt(live ? live.f.helm : 0, 1)}<span className="u">°</span></div></div>
            </div>
          </div>

          {/* ---------------- coach ---------------- */}
          <div className="panel">
            <div className="ph"><span className="lbl">{L(T.coach)}</span>
              <span className="tabs" style={{ marginLeft: "auto" }}>
                <button className={(showIdeal ? "on" : "") + (PRO ? "" : " lock")}
                  onClick={() => gate(() => setShowIdeal(!showIdeal))}>{L(T.showIdeal)}{PRO ? "" : " ●"}</button>
              </span>
            </div>
            {hints.list && hints.list.length === 0 && (!hints.extra || hints.extra.length === 0)
              ? <div className="good">{L(T.onTarget)}</div>
              : <>
                {(hints.list || []).map((h) => (
                  <div className="hint" key={h.k}>
                    <span className="g">+{(h.gain * 100).toFixed(1)}%</span>
                    <span>{HINT[h.k][h.dir][lang]}</span>
                  </div>
                ))}
                {(hints.extra || []).map((x, i) => (
                  <div className="hint" key={"x" + i}><span className="g">RIG</span><span>{x}</span></div>
                ))}
              </>}
          </div>

          {/* ---------------- polar ---------------- */}
          <div className="panel">
            <div className="ph"><span className="lbl">{L(T.polarT)} · {fmt(env.tws, 0)} kn</span></div>
            {PRO ? <PolarChart polar={polar} twa={twaNow} bs={bsKn} tgt={tgtKn} L={L} />
              : <div className="lockpanel" onClick={() => setPayOpen(true)}>
                  <span>{L(T.polarT)} — {L(T.lockedL)} ●</span>
                </div>}
          </div>
        </div>

        {/* ---------------- controls ---------------- */}
        <div>
          <div className="panel">
            <div className="ph"><span className="lbl">{L(T.controls)}</span>
              <span className="tabs">
                <button className={tab === "main" ? "on" : ""} onClick={() => setTab("main")}>{L(T.gMain)}</button>
                <button className={tab === "head" ? "on" : ""} onClick={() => setTab("head")}>{L(T.gHead)}</button>
                <button className={tab === "rig" ? "on" : ""} onClick={() => setTab("rig")}>{L(T.gRig)}</button>
                <button className={tab === "env" ? "on" : ""} onClick={() => setTab("env")}>{L(T.gEnv)}</button>
              </span>
            </div>

            {tab !== "env" && Object.keys(CTRL_META).filter((k) => CTRL_META[k].grp === tab).map((k) => {
              const SS = sailOf(B, rig.headsail);
              if (k === "poleHeight" && SS.ar > 2.2) return null;
              if (CTRL_META[k].grp === "head" && !SS.area) return null;
              if (CTRL_META[k].grp === "rig" && !B.ctrl[k]) return null;
              if (!PRO && !FREE_CTRL.includes(k)) return (
                <div className="ctl lockrow" key={k} onClick={() => setPayOpen(true)}>
                  <div className="row"><span className="nm">{L(T[k])}</span>
                    <span className="end">{L(T.lockedL)} ●</span></div>
                </div>
              );
              return <Slider key={k} name={L(T[k])} lo={L(CTRL_META[k].lo)} hi={L(CTRL_META[k].hi)}
                value={trim[k]} ideal={showIdeal ? ideal[k] : null} onChange={(v) => setT(k, v)}
                effect={effectFor(k)} active={activeCtrl === k} onTouch={() => touchCtrl(k)} />;
            })}

            {tab === "rig" && <>
              <div className="ctl"><div className="row"><span className="nm">{L(T.boatL)}</span></div></div>
              <div className="pillrow">
                {BOAT_KEYS.map((k) => (
                  <button key={k} className={"pill" + (rig.boat === k ? " on" : "") + (PRO || k === FREE_BOAT ? "" : " lock")}
                    onClick={() => (PRO || k === FREE_BOAT ? pickBoat(k) : setPayOpen(true))}>
                    {L(BOATS[k].label)}{PRO || k === FREE_BOAT ? "" : " ●"}</button>
                ))}
              </div>
              <div className="specs">
                {B.loa.toFixed(1)} m · {L(T.beamL)} {B.beam.toFixed(1)} m · {(B.disp / 1000).toFixed(1)} t ·
                {" "}{L(T.sailAreaL)} {(B.mainA + (B.sails.genoa || B.sails.jib || 0)).toFixed(0)} m²
                {B.type === "cat" ? ` · ${L(T.catL)}` : ""}
              </div>
              <div className="ctl"><div className="row"><span className="nm">{L(T.headsailL)}</span></div></div>
              <div className="pillrow">
                {sailKeys(B).map((k) => (
                  <button key={k} className={"pill" + (rig.headsail === k ? " on" : "")}
                    onClick={() => setRig((p) => ({ ...p, headsail: k }))}>{L(SAIL_TYPES[k].label)}</button>
                ))}
              </div>
              <div className="ctl"><div className="row"><span className="nm">{L(T.reefL)}</span></div></div>
              <div className="pillrow">
                {[0, 1, 2, 3].map((r) => (
                  <button key={r} className={"pill" + (rig.reef === r ? " on" : "")}
                    onClick={() => setRig((p) => ({ ...p, reef: r }))}>{r === 0 ? L(T.full) : `${L(T.reefL)} ${r}`}</button>
                ))}
              </div>
            </>}

            {tab === "env" && <>
              <Slider name={L(T.tws)} lo="2 kn" hi="35 kn" raw value={env.tws} min={2} max={35} step={0.5}
                unit="kn" onChange={(v) => setEnv((p) => ({ ...p, tws: v }))} />
              <Slider name={L(T.twa)} lo="20°" hi="180°" raw value={Math.abs(env.twa)} min={20} max={180} step={1}
                unit="°" onChange={(v) => setEnv((p) => ({ ...p, twa: v }))} />
              {!PRO ? <div className="ctl lockrow" onClick={() => setPayOpen(true)}>
                <div className="row"><span className="nm">{L(T.seaState)} · {L(T.gusts)} · {L(T.shifts)} · {L(T.current)}</span>
                  <span className="end">{L(T.lockedL)} ●</span></div>
              </div> : null}
              {PRO && <Slider name={L(T.seaState)} lo="0.0 m" hi="2.5 m" raw value={env.seaState} min={0} max={2.5} step={0.1}
                unit="m Hs" onChange={(v) => setEnv((p) => ({ ...p, seaState: v }))} />}
              {PRO && <Slider name={L(T.gusts)} lo="0 %" hi="100 %" raw value={Math.round(env.gust * 100)} min={0} max={100} step={5}
                unit="%" onChange={(v) => setEnv((p) => ({ ...p, gust: v / 100 }))} />}
              {PRO && <Slider name={L(T.shifts)} lo="0 %" hi="100 %" raw value={Math.round(env.shift * 100)} min={0} max={100} step={5}
                unit="%" onChange={(v) => setEnv((p) => ({ ...p, shift: v / 100 }))} />}
              {PRO && <Slider name={L(T.current)} lo="0" hi="3 kn" raw value={env.current} min={0} max={3} step={0.1}
                unit="kn" onChange={(v) => setEnv((p) => ({ ...p, current: v }))} />}
              {PRO && <Slider name={L(T.currentDir)} lo="0°" hi="360°" raw value={env.currentDir} min={0} max={360} step={5}
                unit="° rel bow" onChange={(v) => setEnv((p) => ({ ...p, currentDir: v }))} />}
              {PRO && <div className="chk">
                <input type="checkbox" id="g" checked={env.gustOn} onChange={(e) => setEnv((p) => ({ ...p, gustOn: e.target.checked }))} />
                <label htmlFor="g">{L(T.gusts)} {lang ? "sees" : "live"}</label>
                <input type="checkbox" id="s" checked={env.shiftOn} onChange={(e) => setEnv((p) => ({ ...p, shiftOn: e.target.checked }))} style={{ marginLeft: 12 }} />
                <label htmlFor="s">{L(T.shifts)} {lang ? "sees" : "live"}</label>
              </div>}
            </>}

            <div className="pillrow" style={{ borderTop: "1px solid var(--line)" }}>
              <button className="pill on" onClick={autoTrim}>{L(T.autoTrim)}</button>
              <button className="pill" onClick={() => setTrim({ ...BASE_TRIM })}>{L(T.reset)}</button>
              <button className="pill" onClick={() => setRunning(!running)}>{running ? L(T.pause) : L(T.run)}</button>
              <button className="pill" onClick={() => setTackSign((s) => -s)}>{L(T.tack)}</button>
            </div>
          </div>

          <div className="panel">
            <div className="ph"><span className="lbl">{L(T.tellt)}</span></div>
            <TelltalePanel s={sections} L={L} lang={lang} />
          </div>

          {payOpen && (
            <div className="modal" onClick={() => setPayOpen(false)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <h2 className="disp">{L(T.payTitle)}</h2>
                <p>{L(T.payBody)}</p>
                <ul>{T.payList[lang].map((x, i) => <li key={i}>{x}</li>)}</ul>
                <div className="pillrow" style={{ padding: "6px 0 0" }}>
                  <button className="pill on" onClick={() => { if (onUpgrade) onUpgrade(); else setPayOpen(false); }}>
                    {L(T.upgradeL)}</button>
                  <button className="pill" onClick={() => setPayOpen(false)}>{L(T.laterL)}</button>
                </div>
              </div>
            </div>
          )}
          <p className="foot">
            {lang
              ? "Sihtkiirus arvutatakse iga kord uuesti sama füüsikamudeliga, aga ideaalse trimmiga — nii näitab protsent puhtalt sinu trimmi kvaliteeti, mitte paadi või tuule piire. Treener järjestab soovitused eeldatava kiirusvõidu järgi."
              : "Target speed is recomputed with the same physics but optimal trim, so the percentage measures your trimming alone, not the boat or the breeze. The coach ranks its advice by the drive it expects each change to add."}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- slider ---------------------------------- */
function Slider({ name, lo, hi, value, ideal, onChange, min = 0, max = 1, step = 0.01, raw, unit, effect, active, onTouch }) {
  const ip = ideal != null ? ((ideal - min) / (max - min)) * 100 : null;
  return (
    <div className={"ctl" + (active ? " act" : "")} onPointerDown={onTouch}>
      <div className="row">
        <span className="nm">{name}</span>
        <span className="end">
          {raw ? `${value.toFixed(step < 1 ? 1 : 0)}${unit ? " " + unit : ""}` : `${Math.round(value * 100)}`}
          {!raw && "%"}
        </span>
      </div>
      <div className="track">
        {ip != null && <span className="tick" style={{ left: `calc(${cl(ip, 0, 100)}% * 0.92 + 11px)` }} />}
        <input type="range" min={min} max={max} step={step} value={value}
          onFocus={onTouch}
          onChange={(e) => { if (onTouch) onTouch(); onChange(parseFloat(e.target.value)); }} />
      </div>
      <div className="row" style={{ fontSize: 11, color: "var(--ink60)", marginTop: -4, paddingBottom: 2 }}>
        <span>{lo}</span>
        {effect ? <span className="eff" style={{ marginLeft: "auto" }}>{effect}</span> : null}
        <span className="end" style={{ fontSize: 11, marginLeft: effect ? 10 : "auto" }}>{hi}</span>
      </div>
    </div>
  );
}

/* ---------------------------- section view -------------------------------- */
const TL_COL = { flow: "var(--teal)", luff: "var(--magenta)", stall: "var(--amber)" };
const TL_RGB = { flow: [12, 123, 133], luff: [190, 36, 120], stall: [199, 126, 18] };
const SEA_RGB = [150, 190, 197], DECK_RGB = [226, 231, 226], HULL_RGB = [30, 62, 74];
const CLOTH_RGB = [236, 239, 234];
function shade(rgb, k) {
  const f = cl(k, 0, 1.35);
  return `rgb(${rgb.map((c) => Math.round(cl(c * f + (255 - c) * Math.max(0, f - 1) * 0.6, 0, 255))).join(",")})`;
}
function sailPath(x0, y0, chord, angleDeg, camber, draft, side) {
  // chord runs aft (+x) rotated by angle; bulge to leeward (side = +1 → +y)
  const a = angleDeg * d2r;
  const x1 = x0 + chord * Math.cos(a), y1 = y0 + side * chord * Math.sin(a);
  const mx = x0 + chord * draft * Math.cos(a), my = y0 + side * chord * draft * Math.sin(a);
  const nx = -Math.sin(a), ny = side * Math.cos(a);
  const bulge = camber * chord * 1.9;
  return `M ${x0} ${y0} Q ${mx + nx * bulge} ${my + ny * bulge} ${x1} ${y1}`;
}
function SectionView({ s, live, L, tack }) {
  const rows = [{ k: "head", y: 52 }, { k: "mid", y: 168 }, { k: "foot", y: 284 }];
  const side = 1;
  return (
    <svg viewBox="0 0 340 356" role="img">
      <rect x="0" y="0" width="340" height="356" fill="var(--panel)" />
      {rows.map((r, i) => {
        const d = s[i]; if (!d) return null;
        const y = r.y;
        const cxHead = 96, cxMain = 168;
        return (
          <g key={r.k}>
            <line x1="12" y1={y} x2="328" y2={y} stroke="var(--line)" strokeDasharray="3 4" />
            <text x="12" y={y - 40} className="tl" fill="var(--ink60)">
              {L(T[r.k]).toUpperCase()} · {L(T.awa)} {d.awa.toFixed(0)}° · {L(T.entry)} {d.aH.toFixed(0)}°/{d.aM.toFixed(0)}°
            </text>
            {/* apparent wind arrow at this height */}
            <g transform={`translate(40 ${y - 26}) rotate(${d.awa})`}>
              <line x1="-26" y1="0" x2="14" y2="0" stroke="var(--deep)" strokeWidth="2" />
              <path d="M14 0 L7 -4 L7 4 Z" fill="var(--deep)" />
            </g>
            {/* headsail */}
            {live.st.headsail !== "none" && (
              <path d={sailPath(cxHead, y, cl(live.f.S.area * 1.05 + 12, 44, 128), d.hAng, d.camH, d.dpH, side)} fill="none"
                stroke={TL_COL[d.stH]} strokeWidth="2.6" strokeLinecap="round" />
            )}
            {/* main */}
            <path d={sailPath(cxMain, y, 84, d.mAng, d.camM, d.dpM, side)} fill="none"
              stroke={TL_COL[d.stM]} strokeWidth="2.6" strokeLinecap="round" />
            {/* mast + forestay dots */}
            <circle cx={cxMain} cy={y} r="3.2" fill="var(--ink)" />
            {live.st.headsail !== "none" && <circle cx={cxHead} cy={y} r="2.4" fill="var(--ink)" />}
            {/* telltale pair on headsail luff */}
            {live.st.headsail !== "none" && (
              <g>
                <line x1={cxHead + 9} y1={y - 5} x2={cxHead + (d.stH === "luff" ? 16 : 22)} y2={y - (d.stH === "luff" ? 12 : 5)}
                  stroke={d.stH === "luff" ? "var(--magenta)" : "var(--ink60)"} strokeWidth="1.4" />
                <line x1={cxHead + 9} y1={y + 5} x2={cxHead + (d.stH === "stall" ? 15 : 22)} y2={y + (d.stH === "stall" ? 13 : 5)}
                  stroke={d.stH === "stall" ? "var(--amber)" : "var(--ink60)"} strokeWidth="1.4" />
              </g>
            )}
          </g>
        );
      })}
      <text x="12" y="344" className="tl" fill="var(--ink30)">BOW ◄ — — — — — — — — — — — — — — — — — — — — ► STERN</text>
    </svg>
  );
}

/* ------------------------------ plan view --------------------------------- */
function PlanView({ live, trim, L, tack, devM, devH }) {
  const { f, st, bs } = live;
  const flip = tack > 0 ? 1 : -1;              // starboard tack: sails to port (screen left)
  const cx = 150, bowY = 84, sternY = 300, mastY = 172, tackY = 104, hullW = 25;
  const B = f.B, mg = f.mg, hg = f.hg, S = f.S;
  const theta = flip * st.twa;                 // wind bearing on screen, 0 = ahead
  const chordH = cl(S.area * 1.05 + 12, 44, 128);
  const colM = TL_COL[devState(devM)], colH = TL_COL[devState(devH)];
  const sc = 6.5, twsN = st.tws, awx = -Math.sin(theta * d2r) * twsN * sc, awy = Math.cos(theta * d2r) * twsN * sc;
  const ox = 246, oy = 300;
  return (
    <svg viewBox="0 0 340 356">
      <rect width="340" height="356" fill="var(--sea)" opacity="0.30" />
      <g transform={`rotate(${theta} ${cx} 190)`} opacity="0.30">
        {[...Array(11)].map((_, i) => (
          <line key={i} x1={-120 + i * 52} y1="-140" x2={-120 + i * 52} y2="500" stroke="var(--deep)" strokeWidth="1" />
        ))}
      </g>
      {(B.type === "cat"
        ? [-1, 1].map((sgn) => sgn * (B.beam / 2 - B.hullHalfW) * (hullW / (B.beam / 2)))
        : [0]).map((off, i) => {
        const w = B.type === "cat" ? hullW * 0.30 : hullW;
        const X = cx + off;
        return (
          <path key={i} d={`M ${X} ${bowY} C ${X + w} ${bowY + 48}, ${X + w + 3} ${sternY - 66}, ${X + w - 5} ${sternY}
                L ${X - w + 5} ${sternY} C ${X - w - 3} ${sternY - 66}, ${X - w} ${bowY + 48}, ${X} ${bowY} Z`}
            fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.6" />
        );
      })}
      <line x1={cx} y1={bowY + 8} x2={cx} y2={sternY - 6} stroke="var(--ink30)" strokeDasharray="4 5" />

      {S.area > 0 && (
        <g transform={`translate(${cx} ${tackY}) rotate(90) scale(1 ${flip})`}>
          <path d={sailPath(0, 0, chordH, hg.angle, hg.camber, hg.draftPos, 1)} fill="none"
            stroke={colH} strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      <g transform={`translate(${cx} ${mastY}) rotate(90) scale(1 ${flip})`}>
        <line x1="0" y1="0" x2={92 * Math.cos(mg.boom * d2r)} y2={92 * Math.sin(mg.boom * d2r)}
          stroke="var(--ink)" strokeWidth="2" opacity="0.45" />
        <path d={sailPath(0, 0, 92, mg.boom, mg.camber, mg.draftPos, 1)} fill="none"
          stroke={colM} strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx={cx} cy={mastY} r="4" fill="var(--ink)" />

      {/* true wind arrow pointing at the boat */}
      <g transform={`translate(${cx + 128 * Math.sin(theta * d2r)} ${190 - 128 * Math.cos(theta * d2r)}) rotate(${theta})`}>
        <line x1="0" y1="-30" x2="0" y2="10" stroke="var(--ink)" strokeWidth="2.2" />
        <path d="M0 16 L-5 5 L5 5 Z" fill="var(--ink)" />
        <text x="6" y="-14" className="tl" fill="var(--ink)" transform={`rotate(${-theta})`}>TW {(st.tws / KT).toFixed(1)}</text>
      </g>

      {/* wind triangle: boat speed, true wind, resulting apparent wind */}
      <g transform={`translate(${ox} ${oy})`}>
        <line x1="0" y1="0" x2="0" y2={-bs * sc} stroke="var(--teal)" strokeWidth="2.4" />
        <line x1="0" y1={-bs * sc} x2={awx} y2={-bs * sc + awy} stroke="var(--ink)" strokeWidth="1.8" />
        <line x1="0" y1="0" x2={awx} y2={-bs * sc + awy} stroke="var(--magenta)" strokeWidth="2.4" />
        <text x="4" y={-bs * sc - 5} className="tl" fill="var(--teal)">BS</text>
        <text x={awx + 4} y={-bs * sc + awy + 11} className="tl" fill="var(--ink)">TW</text>
        <text x={awx / 2 - 24} y={(-bs * sc + awy) / 2 - 2} className="tl" fill="var(--magenta)">AW</text>
      </g>
      <text x="12" y="20" className="tl" fill="var(--ink60)">
        {L(T.twist)} {mg.twist.toFixed(0)}° · {L(T.camber)} {(mg.camber * 100).toFixed(1)}% · {L(T.sag)} {hg.sag.toFixed(2)} m
      </text>
    </svg>
  );
}

/* ----------------------------- cockpit view ------------------------------- */
function CockpitView({ live, s, L, tack, devM, devH }) {
  const { f, st, heel } = live;
  const side = tack > 0 ? -1 : 1;
  const mg = f.mg, hg = f.hg, S = f.S, B = f.B;
  const twsKn = st.tws / KT;
  const wx = weather(twsKn, st.seaState);
  const boomProj = side * 92 * Math.sin(mg.boom * d2r);
  const headProj = side * 72 * Math.sin(hg.angle * d2r);
  const swell = cl(st.seaState, 0, 3);
  const caps = [];
  if (twsKn > 11 && swell > 0.3) {
    const n = Math.round(cl((twsKn - 11) / 2.2, 1, 9));
    for (let i = 0; i < n; i++) {
      const h = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const hh = h < 0 ? h + 1 : h;
      caps.push({ x: -140 + ((hh * 640) % 640), y: 158 + ((hh * 97) % 46) + i * 3,
        w: 10 + hh * 26, o: 0.30 + hh * 0.4 });
    }
  }
  return (
    <svg viewBox="0 0 340 356">
      <defs>
        <clipPath id="cp"><rect width="340" height="356" /></clipPath>
        <linearGradient id="skyC" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={rgbs(wx.skyTop)} />
          <stop offset="100%" stopColor={rgbs(wx.skyLow)} />
        </linearGradient>
        <linearGradient id="seaC" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={rgbs(mix(wx.seaCrest, wx.skyLow, 0.55))} />
          <stop offset="26%" stopColor={rgbs(wx.seaCrest)} />
          <stop offset="100%" stopColor={rgbs(wx.seaBase)} />
        </linearGradient>
      </defs>
      <g clipPath="url(#cp)">
        <rect width="340" height="356" fill="url(#skyC)" />
        <g transform={`rotate(${-side * heel} 170 178)`}>
          <rect x="-200" y="150" width="740" height="440" fill="url(#seaC)" />
          {[...Array(7)].map((_, i) => (
            <path key={i} d={`M -200 ${168 + i * 27 + swell * 2} q ${34 + swell * 12} ${-5 - swell * 5} ${68 + swell * 24} 0
              t ${68 + swell * 24} 0 t ${68 + swell * 24} 0 t ${68 + swell * 24} 0 t ${68 + swell * 24} 0 t ${68 + swell * 24} 0`}
              fill="none" stroke={rgbs(mix(wx.seaCrest, [255, 255, 255], 0.35))}
              strokeWidth={0.8 + swell * 0.5} opacity={0.5 - i * 0.055} />
          ))}
          {caps.map((c, i) => (
            <ellipse key={i} cx={c.x} cy={c.y} rx={c.w} ry={1.4 + swell} fill={rgbs(wx.foam)} opacity={c.o} />
          ))}
        </g>
        <path d={`M 40 356 L 150 120 L 190 120 L 300 356 Z`} fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.4" opacity="0.96" />
        <line x1="170" y1="120" x2="170" y2="356" stroke="var(--ink30)" strokeDasharray="4 5" />
        <line x1="170" y1="26" x2="170" y2="214" stroke="var(--ink)" strokeWidth="4" />
        <line x1="170" y1="196" x2={170 + boomProj} y2="206" stroke="var(--ink)" strokeWidth="3.5" />
        <path d={`M 170 30 Q ${170 + boomProj * (0.55 + mg.twist / 60)} ${110} ${170 + boomProj * 1.02} ${205}`}
          fill="none" stroke={TL_COL[devState(devM)]} strokeWidth="2.6" opacity="0.95" />
        <path d={`M 170 30 L 170 196`} stroke="var(--ink30)" strokeWidth="1" fill="none" />
        {S.area > 0 && <>
          <path d={`M 170 40 L 168 128 L ${170 + headProj * 1.05} ${196} Z`}
            fill="var(--panel)" opacity="0.55" stroke="var(--ink30)" />
          <path d={`M 170 40 Q ${170 + headProj * (0.5 + hg.twist / 70)} 120 ${170 + headProj * 1.05} 196`}
            fill="none" stroke={TL_COL[devState(devH)]} strokeWidth="2.6" />
          {s.map((d, i) => {
            const y = 56 + i * 52, x = 168 - i * 0.5;
            return (
              <g key={i}>
                <line x1={x} y1={y} x2={x + 16} y2={y - (d.stH === "luff" ? 12 : 2)}
                  stroke={d.stH === "luff" ? "var(--magenta)" : "var(--ink60)"} strokeWidth="1.6" />
                <line x1={x} y1={y + 5} x2={x + 15} y2={y + (d.stH === "stall" ? 15 : 6)}
                  stroke={d.stH === "stall" ? "var(--amber)" : "var(--ink60)"} strokeWidth="1.6" />
              </g>
            );
          })}
        </>}
        <g transform="translate(300 40)">
          <text x="-6" y="0" textAnchor="end" className="tl" fill="var(--ink60)">{L(T.heel)}</text>
          <text x="-6" y="20" textAnchor="end" className="tl" fill={heel > 27 ? "var(--magenta)" : "var(--ink)"}
            style={{ fontSize: 17 }}>{heel.toFixed(0)}°</text>
        </g>
      </g>
    </svg>
  );
}

/* -------------------------------- 3D view --------------------------------- */
const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
const LIGHT = v3.norm([0.30, 0.46, 0.84]);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgbs = (c) => `rgb(${Math.round(cl(c[0], 0, 255))},${Math.round(cl(c[1], 0, 255))},${Math.round(cl(c[2], 0, 255))})`;

/* weather palette: the whole scene cools and greys as it blows harder */
function weather(twsKn, sea) {
  const b = cl((twsKn - 8) / 22, 0, 1);            // "breeze" factor
  const skyTop = mix([150, 186, 206], [128, 141, 150], b);
  const skyLow = mix([226, 235, 234], [192, 197, 197], b);
  const seaBase = mix([88, 137, 150], [64, 92, 104], b);
  const seaCrest = mix([144, 186, 192], [126, 148, 154], b);
  const foam = mix([246, 250, 249], [236, 241, 240], b * 0.4);
  return { b, skyTop, skyLow, seaBase, seaCrest, foam,
    cloud: 0.18 + 0.72 * b, capDens: cl((twsKn - 10.5) / 17, 0, 1) };
}

/* Gerstner-ish wind sea: three components fanned around the wind direction */
function seaField(Hs, twsKn, wdx, wdy, t) {
  const H = cl(Hs, 0, 4);
  const per = cl(2.6 + 2.2 * Math.sqrt(H) + 0.05 * twsKn, 2.4, 9);   // peak period, s
  const comps = [];
  const spread = [0, 0.42, -0.62, 1.15];
  const wgt = [0.56, 0.26, 0.13, 0.05];
  for (let i = 0; i < 4; i++) {
    const s = Math.sin(spread[i]), c = Math.cos(spread[i]);
    const dx = wdx * c - wdy * s, dy = wdx * s + wdy * c;
    const T = per * (1 - 0.20 * i);
    const L = (G * T * T) / (2 * Math.PI);
    comps.push({ dx, dy, k: (2 * Math.PI) / L, w: (2 * Math.PI) / T, a: (H / 2) * wgt[i], ph: i * 1.7 });
  }
  const q = cl(0.55 + 0.10 * H, 0, 0.92);          // crest sharpening
  // short chop riding on the swell: barely moves the surface, but it is what
  // gives the water texture and makes cat's-paws visible in a breeze
  const rip = [];
  const ra = 0.010 + 0.030 * cl(twsKn / 26, 0, 1);
  for (let i = 0; i < 3; i++) {
    const ang = [0.30, -0.85, 1.9][i];
    const sN = Math.sin(ang), cN = Math.cos(ang);
    const Lr = [4.2, 2.3, 1.3][i];
    rip.push({ dx: wdx * cN - wdy * sN, dy: wdx * sN + wdy * cN,
      k: (2 * Math.PI) / Lr, w: Math.sqrt(G * (2 * Math.PI) / Lr), a: ra * [1, 0.66, 0.42][i], ph: i * 2.3 });
  }
  const at = (x, y) => {
    let z = 0, gx = 0, gy = 0, ox = 0, oy = 0;
    for (const c of comps) {
      const p = c.k * (c.dx * x + c.dy * y) - c.w * t + c.ph;
      const sn = Math.sin(p), cs = Math.cos(p);
      z += c.a * sn;
      gx += c.a * c.k * c.dx * cs; gy += c.a * c.k * c.dy * cs;
      ox -= q * c.a * c.dx * cs; oy -= q * c.a * c.dy * cs;
    }
    const steep = Math.hypot(gx, gy);
    let rx = 0, ry = 0;
    for (const c of rip) {
      const p = c.k * (c.dx * x + c.dy * y) - c.w * t + c.ph;
      const cs = Math.cos(p);
      z += c.a * Math.sin(p) * 0.5;
      rx += c.a * c.k * c.dx * cs; ry += c.a * c.k * c.dy * cs;
    }
    return { z, ox, oy, n: v3.norm([-(gx + rx), -(gy + ry), 1]), steep };
  };
  return { at, H };
}

function ThreeDView({ live, trim, ideal, L, tack, focus, reef, phase, cam, setCam, quality }) {
  const drag = useRef(null);
  const onDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    setCam((c) => ({ ...c, az: d.az - (e.clientX - d.x) * 0.5, el: cl(d.el + (e.clientY - d.y) * 0.32, -3, 78) }));
  };
  const onUp = () => { drag.current = null; };

  const { f, st, bs, heel } = live;
  const B = f.B;
  const twsKn = st.tws / KT;
  const W = 340, H = 356, FL = 430;
  const rigTop = B.boomZ + B.P;
  const scale = rigTop / 17.55;
  const D = cam.dist * scale;
  const target = [-0.4, 0, rigTop * 0.44];
  const az = cam.az * d2r, el = cam.el * d2r;
  const eye = [target[0] + D * Math.cos(el) * Math.sin(az),
               target[1] + D * Math.cos(el) * Math.cos(az),
               target[2] + D * Math.sin(el)];
  const fwd = v3.norm(v3.sub(target, eye));
  const right = v3.norm(v3.cross(fwd, [0, 0, 1]));
  const upv = v3.cross(right, fwd);
  const proj = (p) => {
    const v = v3.sub(p, eye), z = v3.dot(v, fwd);
    if (z < 1.0) return null;
    return [W / 2 + FL * v3.dot(v, right) / z, H / 2 - FL * v3.dot(v, upv) / z, z];
  };
  const viewDir = v3.mul(fwd, -1);

  const wx = weather(twsKn, st.seaState);
  const flip = tack > 0 ? 1 : -1;
  const theta = Math.abs(st.twa) * d2r;
  const wdx = -Math.cos(theta), wdy = Math.sin(theta) * flip;   // waves travel with the wind
  const sea = seaField(st.seaState, twsKn, wdx, wdy, phase);

  /* ---- boat attitude: heave, pitch and roll follow the wave under the hull ---- */
  const LH = B.loa / 2;
  const zBow = sea.at(LH * 0.8, 0).z, zStern = sea.at(-LH * 0.8, 0).z;
  const zPort = sea.at(0, B.beam * 0.35).z, zStbd = sea.at(0, -B.beam * 0.35).z;
  const heave = (zBow + zStern) * 0.5 * 0.85;
  const pitch = Math.atan2(zBow - zStern, LH * 1.6) * 0.62;
  const waveRoll = Math.atan2(zPort - zStbd, B.beam * 0.7) * (B.type === "cat" ? 0.30 : 0.55) * r2d;
  const hr = (heel + waveRoll * flip) * d2r;
  const ch = Math.cos(hr), sh = Math.sin(hr) * flip;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const tf = (x, y, z) => {
    const yy = y * flip;
    const Y = yy * ch + z * sh;
    const Z0 = -yy * sh + z * ch;
    return [x * cp + Z0 * sp, Y, -x * sp + Z0 * cp + heave];
  };

  const water = [], boat = [], sails = [], foamq = [];
  const push = (arr, pts3, rgb, op, extra) => {
    const ps = pts3.map(proj);
    if (ps.some((p) => !p)) return;
    const d = ps.reduce((a, p) => a + p[2], 0) / ps.length;
    arr.push({ d, pts: ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "),
      fill: rgbs(rgb), op: op == null ? 1 : op, ...(extra || {}) });
  };
  const fog = (rgb, z) => mix(rgb, wx.skyLow, cl((z - 22 * scale) / (120 * scale), 0, 0.86));
  const litW = (n, z) => {
    const diff = 0.84 + 0.20 * Math.abs(v3.dot(n, LIGHT));
    const R = v3.sub(v3.mul(n, 2 * v3.dot(n, LIGHT)), LIGHT);
    const spec = Math.pow(Math.max(0, v3.dot(R, viewDir)), 62) * 0.42;
    return { diff, spec };
  };

  /* ---------------------------- sea surface ---------------------------- */
  const GX = quality === "low"
    ? [-120, -62, -34, -18, -8, -2.5, 2.5, 8, 18, 34, 62, 120]
    : [-130, -78, -48, -30, -19, -12, -7, -3.5, 0, 3.5, 7, 12, 19, 30, 48, 78, 130];
  const wpt = (x, y) => { const s = sea.at(x, y); return { p: [x + s.ox, y + s.oy, s.z], s }; };
  const caps = [];
  for (let i = 0; i < GX.length - 1; i++) {
    for (let j = 0; j < GX.length - 1; j++) {
      const x0 = GX[i], x1 = GX[i + 1], y0 = GX[j], y1 = GX[j + 1];
      const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
      if (Math.hypot(xm, ym) > 140) continue;
      const a = wpt(x0, y0), b = wpt(x1, y0), c = wpt(x1, y1), dd = wpt(x0, y1);
      const s = sea.at(xm, ym);
      const { diff, spec } = litW(s.n);
      const crest = sea.H > 0.03 ? cl(s.z / (sea.H * 0.55) * 0.5 + 0.5, 0, 1) : 0.5;
      let col = mix(wx.seaBase, wx.seaCrest, crest * 0.85);
      col = v3.mul(col, diff);
      col = mix(col, [255, 255, 255], spec);
      const pr = proj([xm + s.ox, ym + s.oy, s.z]);
      if (pr) col = fog(col, pr[2]);
      push(water, [a.p, b.p, c.p, dd.p], col, 1);
      // whitecaps break on the steep windward face of the bigger crests
      // whitecaps: crests break where the short chop is energetic, i.e. with wind
      const rr = Math.hypot(xm, ym);
      if (sea.H > 0.30 && wx.capDens > 0.02 && rr > 9 && rr < 72) {
        const crestN = s.z / (sea.H * 0.5 + 0.01);
        const hash = (Math.sin(xm * 12.9898 + ym * 78.233 + Math.floor(phase * 0.7) * 3.71) * 43758.5453) % 1;
        const hh = hash < 0 ? hash + 1 : hash;
        if (crestN > 1.05 - wx.capDens * 0.95 && hh < wx.capDens * 0.8) {
          const j1 = ((hh * 7.13) % 1), j2 = ((hh * 3.71) % 1);
          caps.push({ x: xm + (j1 - 0.5) * (x1 - x0) * 0.6, y: ym + (j2 - 0.5) * (y1 - y0) * 0.6,
            s, w: cl(Math.min(x1 - x0, 4) * (0.18 + 0.20 * j1), 0.40, 1.5), h: hh });
        }
      }
    }
  }
  for (const c of caps) {
    // an irregular streak of foam, elongated downwind
    const N = 7, pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 2 * Math.PI;
      const wob = 0.62 + 0.55 * (((c.h * (i + 3) * 9.37) % 1));
      const rx = c.w * 2.1 * wob, ry = c.w * 0.85 * wob;
      const lx = Math.cos(a) * rx, ly = Math.sin(a) * ry;
      const x = c.x + wdx * lx - wdy * ly, y = c.y + wdy * lx + wdx * ly;
      const q = sea.at(x, y);
      pts.push([x + q.ox, y + q.oy, q.z + 0.04]);
    }
    const pr = proj([c.x, c.y, c.s.z]);
    push(foamq, pts, pr ? fog(wx.foam, pr[2]) : wx.foam, 0.62 + 0.28 * c.h);
  }

  /* ------------------------------ wake ------------------------------- */
  const spd = bs / KT;
  const wakeOp = cl((spd - 1.8) / 6.0, 0, 0.60);
  if (wakeOp > 0.03) {
    const bow = LH * 0.94;
    const len = cl(spd * 1.5, 4, 15) + B.loa * 0.25;
    const spread = 0.36;                       // Kelvin half-angle
    const onSea = (x, y, lift) => { const q = sea.at(x, y); return [x + q.ox, y + q.oy, q.z + lift]; };
    for (const sgn of [1, -1]) {
      const inner = [], outer = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6, x = bow - t * len;
        const y0 = sgn * (B.beam * 0.10 + spread * t * len * 0.55);
        const wdt = 0.22 + 0.85 * t;
        inner.push(onSea(x, y0, 0.05));
        outer.push(onSea(x, y0 + sgn * wdt, 0.05));
      }
      push(foamq, [...inner, ...outer.reverse()], wx.foam, wakeOp * 0.62);
    }
    // transom wash
    const hw = B.beam * (B.type === "cat" ? 0.44 : 0.26);
    const wl = cl(spd * 1.2, 3, 11);
    const a = [], b = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5, x = -LH * 0.92 - t * wl;
      a.push(onSea(x, hw + t * 0.9, 0.04));
      b.push(onSea(x, -hw - t * 0.9, 0.04));
    }
    push(foamq, [...a, ...b.reverse()], wx.foam, wakeOp * 0.42);
  }

  /* ------------------------------- hulls ------------------------------ */
  const ST = [
    [1.000, 0.03, 1.16], [0.930, 0.26, 1.10], [0.840, 0.48, 1.045], [0.700, 0.72, 0.995],
    [0.520, 0.90, 0.955], [0.300, 0.985, 0.925], [0.050, 1.000, 0.908], [-0.200, 0.975, 0.905],
    [-0.470, 0.905, 0.918], [-0.720, 0.800, 0.945], [-0.900, 0.700, 0.972], [-1.000, 0.630, 0.992],
  ];
  const hulls = B.type === "cat"
    ? [{ y: B.beam / 2 - B.hullHalfW, w: B.hullHalfW }, { y: -(B.beam / 2 - B.hullHalfW), w: B.hullHalfW }]
    : [{ y: 0, w: B.beam / 2 }];
  const bootTop = B.deckZ * 0.20, sheerOf = (f) => B.deckZ * f;
  let deckPts = null, deckRing = null;
  const hullCol = fog(HULL_RGB, D);
  for (const hl of hulls) {
    const side = (sgn) => {
      for (let i = 0; i < ST.length - 1; i++) {
        const [f0, b0, s0] = ST[i], [f1, b1, s1] = ST[i + 1];
        const y0 = hl.y + sgn * b0 * hl.w, y1 = hl.y + sgn * b1 * hl.w;
        const wy0 = hl.y + sgn * Math.pow(b0, 1.35) * hl.w * 0.90;
        const wy1 = hl.y + sgn * Math.pow(b1, 1.35) * hl.w * 0.90;
        const nrm = v3.norm([0, sgn * flip, 0.30]);
        const lit = 0.64 + 0.48 * Math.abs(v3.dot(nrm, LIGHT));
        // topsides
        push(boat, [tf(f0 * LH, y0, sheerOf(s0)), tf(f1 * LH, y1, sheerOf(s1)),
          tf(f1 * LH, wy1, bootTop), tf(f0 * LH, wy0, bootTop)], v3.mul(hullCol, lit), 1);
        // boot stripe at the waterline
        push(boat, [tf(f0 * LH, wy0, bootTop), tf(f1 * LH, wy1, bootTop),
          tf(f1 * LH, wy1 * 0.99, 0.01), tf(f0 * LH, wy0 * 0.99, 0.01)],
          v3.mul(mix(HULL_RGB, [190, 60, 110], 0.30), lit * 0.8), 1);
      }
    };
    side(1); side(-1);
    // transom
    const [fe, be, se] = ST[ST.length - 1];
    push(boat, [tf(fe * LH, hl.y + be * hl.w, sheerOf(se)), tf(fe * LH, hl.y - be * hl.w, sheerOf(se)),
      tf(fe * LH, hl.y - be * hl.w * 0.9, 0.01), tf(fe * LH, hl.y + be * hl.w * 0.9, 0.01)],
      v3.mul(hullCol, 0.82), 1);
    // deck
    const ring = [...ST.map(([fx, b, s]) => [fx * LH, hl.y + b * hl.w, sheerOf(s)]),
      ...ST.slice(0, -1).reverse().map(([fx, b, s]) => [fx * LH, hl.y - b * hl.w, sheerOf(s)])];
    const ring3 = ring.map(([x, y, z]) => tf(x, y, z));
    push(boat, ring3, fog(v3.mul(DECK_RGB, 0.98), D), 1);
    const rp = ring3.map(proj);
    if (!deckPts && rp.every(Boolean)) {
      deckPts = rp.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ");
      deckRing = ring;
    }
  }

  /* bridgedeck, saloon and coachroof */
  const box = (x0, x1, hw0, hw1, z0, z1, rgb) => {
    const c = [[x0, hw0], [x1, hw1]];
    for (const sgn of [1, -1]) {
      push(boat, [tf(x0, sgn * hw0, z0), tf(x1, sgn * hw1, z0), tf(x1, sgn * hw1, z1), tf(x0, sgn * hw0, z1)],
        v3.mul(rgb, 0.80 + 0.30 * (sgn * flip > 0 ? 1 : 0.55)), 1);
    }
    push(boat, [tf(x1, hw1, z0), tf(x1, -hw1, z0), tf(x1, -hw1, z1), tf(x1, hw1, z1)], v3.mul(rgb, 0.90), 1); // front
    push(boat, [tf(x0, hw0, z0), tf(x0, -hw0, z0), tf(x0, -hw0, z1), tf(x0, hw0, z1)], v3.mul(rgb, 0.72), 1); // back
    push(boat, [tf(x0, hw0, z1), tf(x1, hw1, z1), tf(x1, -hw1, z1), tf(x0, -hw0, z1)], v3.mul(rgb, 1.06), 1); // top
  };
  const glass = fog([70, 96, 106], D);
  if (B.type === "cat") {
    const y = B.beam / 2 - B.hullHalfW;
    push(boat, [tf(-LH * 0.66, y, B.deckZ * 0.92), tf(LH * 0.50, y, B.deckZ * 0.92),
      tf(LH * 0.50, -y, B.deckZ * 0.92), tf(-LH * 0.66, -y, B.deckZ * 0.92)],
      fog(v3.mul(DECK_RGB, 0.95), D), 1);
    if (B.hullHalfW > 0.60) {          // cruising cat: saloon
      box(-LH * 0.44, LH * 0.24, y * 0.88, y * 0.74, B.deckZ * 0.92, B.deckZ * 0.92 + 1.55, fog(DECK_RGB, D));
      push(boat, [tf(LH * 0.24, y * 0.70, B.deckZ * 0.92 + 0.55), tf(LH * 0.24, -y * 0.70, B.deckZ * 0.92 + 0.55),
        tf(LH * 0.24, -y * 0.70, B.deckZ * 0.92 + 1.42), tf(LH * 0.24, y * 0.70, B.deckZ * 0.92 + 1.42)], glass, 1);
    } else {                            // performance cat: trampoline
      for (let i = 1; i < 7; i++) {
        const t = i / 7, x = LH * 0.50 + t * (LH * 0.86 - LH * 0.50);
        push(boat, [tf(x, y * (1 - t * 0.5), B.deckZ * 0.93), tf(x + 0.12, y * (1 - t * 0.5), B.deckZ * 0.93),
          tf(x + 0.12, -y * (1 - t * 0.5), B.deckZ * 0.93), tf(x, -y * (1 - t * 0.5), B.deckZ * 0.93)],
          fog(v3.mul(HULL_RGB, 1.5), D), 0.55);
      }
    }
    // crossbeam
    box(LH * 0.52, LH * 0.62, y * 1.02, y * 1.02, B.deckZ * 0.82, B.deckZ * 1.02, fog(HULL_RGB, D));
  } else {
    const hw = B.beam / 2;
    box(-LH * 0.10, LH * 0.52, hw * 0.62, hw * 0.44, B.deckZ, B.deckZ + B.beam * 0.16, fog(DECK_RGB, D));
    // coachroof windows
    for (const sgn of [1, -1]) {
      push(boat, [tf(-LH * 0.04, sgn * hw * 0.60, B.deckZ + B.beam * 0.05),
        tf(LH * 0.40, sgn * hw * 0.47, B.deckZ + B.beam * 0.05),
        tf(LH * 0.40, sgn * hw * 0.47, B.deckZ + B.beam * 0.12),
        tf(-LH * 0.04, sgn * hw * 0.60, B.deckZ + B.beam * 0.12)], glass, 1);
    }
    // cockpit well
    push(boat, [tf(-LH * 0.18, hw * 0.52, B.deckZ - 0.30), tf(-LH * 0.78, hw * 0.44, B.deckZ - 0.30),
      tf(-LH * 0.78, -hw * 0.44, B.deckZ - 0.30), tf(-LH * 0.18, -hw * 0.52, B.deckZ - 0.30)],
      fog(v3.mul(DECK_RGB, 0.80), D), 1);
  }

  /* ------------------------------- sails ------------------------------ */
  const NS = quality === "low" ? 6 : 9, NC = quality === "low" ? 5 : 7;
  const mg = f.mg, hg = f.hg, S = f.S;
  const bands = [];
  for (let i = 0; i <= NS; i++) bands.push(sectionAt(i / NS, st, trim, bs, heel, ideal));

  const clothCol = (dev) => {
    const m = Math.abs(dev);
    if (m < 5.5) return mix(CLOTH_RGB, TL_RGB.flow, 0.13);
    const t = cl((m - 5.5) / 13, 0, 1);
    return mix(mix(CLOTH_RGB, TL_RGB.flow, 0.13), dev > 0 ? TL_RGB.stall : TL_RGB.luff, t * 0.82);
  };

  const hoist = B.P * Math.pow(REEF[reef], 0.55), boomZ = B.boomZ;
  const kMain = Math.log(0.5) / Math.log(cl(mg.draftPos, 0.18, 0.82));
  const roachM = B.type === "cat" ? 0.20 : 0.13;
  const mainPt = (u, v) => {
    const z = boomZ + u * hoist;
    const chord = B.E * (1 - B.headTaper[0] * Math.pow(u, B.headTaper[1])) * (1 + roachM * Math.sin(Math.PI * u));
    const dd = (mg.boom + mg.twist * u) * d2r;
    const bend = 0.5 * trim.backstay * Math.sin(Math.PI * u);
    const amp = mg.camber * chord * (0.55 + 0.45 * Math.sin(Math.PI * Math.pow(u, 0.85)));
    const fv = Math.sin(Math.PI * Math.pow(v, kMain));
    return tf(-bend - chord * v * Math.cos(dd) + amp * fv * Math.sin(dd),
      chord * v * Math.sin(dd) + amp * fv * Math.cos(dd), z);
  };
  const kite = S.ar < 2.2;
  const hoistH = B.I * (kite ? 0.99 : 0.96);
  const tackX = kite ? B.J + 1.5 : B.J;
  const chord0 = S.area ? (S.area * hg.furl) / (hoistH * (kite ? 0.78 : 0.5)) : 0;
  const kHead = Math.log(0.5) / Math.log(cl(hg.draftPos, 0.18, 0.82));
  const headPt = (u, v) => {
    const z = B.deckZ + 0.05 + u * hoistH;
    const sag = hg.sag * Math.sin(Math.PI * u);
    const chord = chord0 * (kite ? 0.34 + 0.66 * Math.sin(Math.PI * Math.pow(u, 0.72))
                                 : 1 - 0.90 * Math.pow(u, 1.15));
    const dd = (hg.angle + hg.twist * u) * d2r;
    const amp = hg.camber * chord * (0.50 + 0.50 * Math.sin(Math.PI * Math.pow(u, 0.8)));
    const fv = Math.sin(Math.PI * Math.pow(v, kHead));
    const lx = tackX * (1 - u) - 0.25 * sag;
    return tf(lx - chord * v * Math.cos(dd) + amp * fv * Math.sin(dd),
      sag + chord * v * Math.sin(dd) + amp * fv * Math.cos(dd), z);
  };

  const surface = (ptFn, devOf, dim) => {
    for (let i = 0; i < NS; i++) for (let j = 0; j < NC; j++) {
      const u0 = i / NS, u1 = (i + 1) / NS, v0 = j / NC, v1 = (j + 1) / NC;
      const a = ptFn(u0, v0), b = ptFn(u0, v1), c = ptFn(u1, v1), dd = ptFn(u1, v0);
      const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(dd, a)));
      const back = v3.dot(n, LIGHT) < 0;
      const lit = back ? 0.74 : 0.88 + 0.34 * Math.abs(v3.dot(n, LIGHT));
      push(sails, [a, b, c, dd], v3.mul(clothCol(devOf(i)), lit), dim);
    }
  };
  surface(mainPt, (i) => bands[i].devM, focus === "head" ? 0.30 : 1);
  if (S.area) surface(headPt, (i) => bands[i].devH, focus === "main" ? 0.30 : 1);

  const poly = (pts3) => {
    const q = pts3.map(proj).filter(Boolean);
    return q.length > 1 ? q.map((r) => `${r[0].toFixed(1)},${r[1].toFixed(1)}`).join(" ") : null;
  };
  const outline = (ptFn) => {
    const pts = [];
    for (let i = 0; i <= NS; i++) pts.push(ptFn(i / NS, 0));
    for (let j = 0; j <= NC; j++) pts.push(ptFn(1, j / NC));
    for (let i = NS; i >= 0; i--) pts.push(ptFn(i / NS, 1));
    return poly(pts);
  };
  const outM = outline(mainPt), outH = S.area ? outline(headPt) : null;
  // cross-cut panel seams and battens
  const seams = [], battens = [];
  const NSEAM = quality === "low" ? 4 : 7;
  for (let i = 1; i < NSEAM; i++) {
    const u = i / NSEAM;
    const p = poly([0, 0.25, 0.5, 0.75, 1].map((v) => mainPt(u, v)));
    if (p) seams.push(p);
    if (S.area) {
      const q = poly([0, 0.3, 0.6, 1].map((v) => headPt(u, v)));
      if (q) seams.push(q);
    }
  }
  if (quality !== "low") {
    for (const u of [0.14, 0.40, 0.66, 0.90]) {
      const p = poly([0.42, 0.7, 1].map((v) => mainPt(u, v)));
      if (p) battens.push(p);
    }
  }

  water.sort((a, b) => b.d - a.d);
  boat.sort((a, b) => b.d - a.d);
  sails.sort((a, b) => b.d - a.d);

  /* ------------------------------- rig -------------------------------- */
  const seg = (p1, p2) => { const a = proj(p1), b = proj(p2); return a && b ? { a, b } : null; };
  const mastH = boomZ + B.P * 0.99;
  const mastTop = tf(0, 0, mastH);
  const spr = [0.40, 0.68].map((u) => ({ z: boomZ + B.P * u, w: B.beam * (B.type === "cat" ? 0.13 : 0.20) }));
  const chain = B.beam * (B.type === "cat" ? 0.30 : 0.40);
  const lines = [];
  const add = (p1, p2, w, c, op) => { const s = seg(p1, p2); if (s) lines.push({ s, w, c, op }); };
  add(tf(0, 0, B.deckZ * 0.4), mastTop, 3.6, "var(--ink)");
  add(tf(0, 0, boomZ), mainPt(0, 1), 3.0, "var(--ink)");
  add(tf(B.J, 0, B.deckZ + 0.05), mastTop, 1.0, "var(--ink30)");                 // forestay
  if (B.ctrl.backstay) add(tf(-LH * 0.98, 0, B.deckZ), mastTop, 1.0, "var(--ink30)");
  for (const sgn of [1, -1]) {
    for (const s of spr) {
      add(tf(0, 0, s.z), tf(0, sgn * s.w, s.z), 2.0, "var(--ink)");              // spreader
    }
    add(tf(0, sgn * spr[1].w, spr[1].z), mastTop, 0.9, "var(--ink30)");
    add(tf(0, sgn * spr[0].w, spr[0].z), tf(0, sgn * spr[1].w, spr[1].z), 0.9, "var(--ink30)");
    add(tf(0, sgn * chain, B.deckZ), tf(0, sgn * spr[0].w, spr[0].z), 0.9, "var(--ink30)");
    if (B.ctrl.runners) add(tf(-LH * 0.55, sgn * chain * 0.8, B.deckZ), tf(0, 0, boomZ + B.P * 0.80), 0.7, "var(--ink30)");
  }
  // boom vang and mainsheet
  add(tf(0, 0, boomZ * 0.62), mainPt(0, 0.30), 1.2, "var(--ink30)");
  const clew = mainPt(0, 1);
  add(clew, tf(-LH * 0.42, (mg.boom * 0.02) * flip, B.deckZ), 0.9, "var(--ink30)");

  /* telltales, vane, spray */
  const tells = S.area ? [0.22, 0.5, 0.78].map((u) => {
    const b = bands[Math.round(u * NS)];
    const a = proj(headPt(u, 0.10)); if (!a) return null;
    const s = b.stH;
    return { a, lift: s === "luff" ? -12 : s === "stall" ? 12 : 0, st: s };
  }).filter(Boolean) : [];

  const aw = f.awa * d2r;
  const vTop = mastH + 0.4;
  const wa = proj(tf(-0.9 * Math.cos(aw), 0.9 * Math.sin(aw) * flip, vTop));
  const wb = proj(tf(3.0 * Math.cos(aw), -3.0 * Math.sin(aw) * flip, vTop));

  const spray = [];
  if (st.seaState > 1.1 && spd > 4.8 && Math.abs(st.twa) < 105) {
    const n = Math.round(cl((st.seaState - 1.1) * 4 + (spd - 4.8) * 0.8, 2, 8));
    const burst = 0.5 + 0.5 * Math.sin(phase * 1.35);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const p = proj(tf(LH * (0.86 - 0.30 * t), -(B.beam * 0.30 + 1.1 * t),
        0.15 + (0.5 + 1.1 * burst) * Math.sin(Math.PI * cl(t + 0.15, 0, 1))));
      if (p) spray.push({ p, r: (1.1 + 1.9 * (1 - t)) * (0.55 + 0.6 * burst) });
    }
  }

  /* clouds drift with the wind and shift as the camera orbits */
  const clouds = [];
  const cn = Math.round(2 + wx.cloud * 5);
  const horizonY = (() => { const p = proj([eye[0] + fwd[0] * 900, eye[1] + fwd[1] * 900, 0]); return p ? p[1] : 150; })();
  for (let i = 0; i < cn; i++) {
    const seed = (i * 97.31) % 100;
    const span = 620;
    let x = (phase * (0.35 + twsKn * 0.03) + seed * 6.1 - cam.az * 2.2) % span;
    if (x < 0) x += span;
    x -= 140;
    const baseY = cl(horizonY - 34 - (seed % 52), 4, 130);
    for (let k = 0; k < 3; k++) {
      clouds.push({ x: x + (k - 1) * (16 + seed % 13), y: baseY + (k === 1 ? -5 : 2),
        rx: 26 + ((seed * (k + 2)) % 34), ry: 6 + ((seed + k * 5) % 7),
        o: (0.10 + wx.cloud * 0.16) * (k === 1 ? 1.15 : 0.85) });
    }
  }

  return (
    <svg viewBox="0 0 340 356" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
      onPointerCancel={onUp} style={{ cursor: "grab", userSelect: "none", touchAction: "none" }}>
      <defs>
        <linearGradient id="sky3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={rgbs(wx.skyTop)} />
          <stop offset="66%" stopColor={rgbs(mix(wx.skyTop, wx.skyLow, 0.72))} />
          <stop offset="100%" stopColor={rgbs(wx.skyLow)} />
        </linearGradient>
        <filter id="soft" x="-25%" y="-90%" width="150%" height="320%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <rect width="340" height="356" fill="url(#sky3)" />
      <g filter="url(#soft)">
        {clouds.map((c, i) => (
          <ellipse key={"c" + i} cx={c.x} cy={c.y} rx={c.rx} ry={c.ry}
            fill={rgbs(mix(wx.skyLow, [255, 255, 255], 0.62 - wx.cloud * 0.42))} opacity={c.o} />
        ))}
      </g>
      {water.map((q, i) => <polygon key={"w" + i} points={q.pts} fill={q.fill} stroke={q.fill} strokeWidth="0.7" />)}
      {foamq.map((q, i) => <polygon key={"f" + i} points={q.pts} fill={q.fill} fillOpacity={q.op} />)}
      {boat.map((q, i) => <polygon key={"b" + i} points={q.pts} fill={q.fill} stroke={q.fill} strokeWidth="0.4" />)}
      {deckPts && <polyline points={deckPts} fill="none" stroke="var(--ink)" strokeWidth="0.9" opacity="0.5" />}
      {sails.map((q, i) => <polygon key={"s" + i} points={q.pts} fill={q.fill} fillOpacity={q.op}
        stroke={q.fill} strokeWidth="0.5" strokeOpacity={q.op} />)}
      {seams.map((p, i) => <polyline key={"sm" + i} points={p} fill="none" stroke="rgba(17,36,44,.20)" strokeWidth="0.6" />)}
      {battens.map((p, i) => <polyline key={"bt" + i} points={p} fill="none" stroke="rgba(17,36,44,.34)" strokeWidth="1.3" />)}
      {outM && <polyline points={outM} fill="none" stroke="var(--ink)" strokeWidth="1.1" opacity={focus === "head" ? 0.28 : 0.72} />}
      {outH && <polyline points={outH} fill="none" stroke="var(--ink)" strokeWidth="1.1" opacity={focus === "main" ? 0.28 : 0.72} />}
      {lines.map((l, i) => <line key={i} x1={l.s.a[0]} y1={l.s.a[1]} x2={l.s.b[0]} y2={l.s.b[1]}
        stroke={l.c} strokeWidth={l.w} strokeLinecap="round" opacity={l.op == null ? 1 : l.op} />)}
      {spray.map((s, i) => <circle key={"sp" + i} cx={s.p[0]} cy={s.p[1]} r={s.r} fill={rgbs(wx.foam)} opacity="0.66" />)}
      {tells.map((t, i) => (
        <line key={"t" + i} x1={t.a[0]} y1={t.a[1]} x2={t.a[0] + 13} y2={t.a[1] + t.lift}
          stroke={TL_COL[t.st]} strokeWidth="1.8" />
      ))}
      {wa && wb && <>
        <line x1={wa[0]} y1={wa[1]} x2={wb[0]} y2={wb[1]} stroke="var(--magenta)" strokeWidth="2" />
        <circle cx={wb[0]} cy={wb[1]} r="2.6" fill="var(--magenta)" />
        <text x={wb[0] + 5} y={wb[1] - 3} className="tl" fill="var(--magenta)">
          {f.awa.toFixed(0)}° · {(f.aws / KT).toFixed(1)} kn
        </text>
      </>}
      <text x="12" y="348" className="tl" fill="rgba(17,36,44,.42)">{L(T.dragHint)}</text>
    </svg>
  );
}

/* ------------------------------ polar chart -------------------------------- */
function PolarChart({ polar, twa, bs, tgt, L }) {
  const cx = 46, cy = 124, R = 104, maxKn = 11;
  const P = (a, v) => {
    const r = (cl(v, 0, maxKn) / maxKn) * R;
    return [cx + r * Math.sin(a * d2r), cy - r * Math.cos(a * d2r)];
  };
  const path = polar.length
    ? polar.map((p, i) => { const q = P(p.twa, p.bs / KT); return `${i ? "L" : "M"} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`; }).join(" ")
    : "";
  const live = P(twa, bs), tg = P(twa, tgt);
  return (
    <svg viewBox="0 0 210 250">
      <rect width="210" height="250" fill="var(--panel)" />
      {[2, 4, 6, 8, 10].map((v) => {
        const r = (v / maxKn) * R;
        return (
          <g key={v}>
            <path d={`M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r}`} fill="none" stroke="var(--line)" />
            <text x={cx + 3} y={cy + r - 3} className="tl" fill="var(--ink30)">{v}</text>
          </g>
        );
      })}
      {[0, 30, 60, 90, 120, 150, 180].map((a) => {
        const e = P(a, maxKn), t = P(a, maxKn * 1.09);
        return (
          <g key={a}>
            <line x1={cx} y1={cy} x2={e[0]} y2={e[1]} stroke="var(--line)" />
            <text x={t[0] - 5} y={t[1] + 4} className="tl" fill="var(--ink30)">{a}</text>
          </g>
        );
      })}
      {path && <path d={path} fill="none" stroke="var(--magenta)" strokeWidth="2" />}
      <line x1={cx} y1={cy} x2={live[0]} y2={live[1]} stroke="var(--teal)" strokeWidth="1.1" strokeDasharray="3 3" />
      <circle cx={tg[0]} cy={tg[1]} r="4.5" fill="none" stroke="var(--magenta)" strokeWidth="1.8" />
      <circle cx={live[0]} cy={live[1]} r="4.5" fill="var(--teal)" />
      <text x="8" y="243" className="tl" fill="var(--ink60)">kn · ◯ {L(T.target)} · ● {L(T.boatSpeed)}</text>
    </svg>
  );
}

/* ---------------------------- telltale panel ------------------------------- */
function TelltalePanel({ s, L, lang }) {
  const names = [T.head, T.mid, T.foot];
  const words = { flow: T.attached, luff: T.luffing, stall: T.stalled };
  return (
    <div>
      {s.map((d, i) => (
        <div className="hint" key={i}>
          <span className="g" style={{ color: "var(--ink60)", minWidth: 54 }}>{L(names[i])}</span>
          <span>
            <b style={{ color: TL_COL[d.stH] }}>{L(words[d.stH])}</b>
            <span style={{ color: "var(--ink60)" }}> · {L(T.entry)} {d.aH.toFixed(0)}° · {L(T.awa)} {d.awa.toFixed(0)}°</span>
            <br />
            <span style={{ fontSize: 12.5, color: "var(--ink60)" }}>
              {d.stH === "luff"
                ? (lang ? "tuulepoolne niit tõuseb — soot sisse või sõida madalamalt" : "windward telltale lifting — sheet in or bear away")
                : d.stH === "stall"
                  ? (lang ? "allatuule niit seisab — lase soot lõdvemaks või sõida kõrgemalt" : "leeward telltale stalling — ease sheet or head up")
                  : (lang ? "mõlemad niidid voolavad" : "both telltales streaming")}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
