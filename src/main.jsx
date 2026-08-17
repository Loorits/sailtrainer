import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import App from "./trainer.jsx";

/* ==========================================================================
   Site shell: decides which tier the visitor gets and mounts the trainer.

   IMPORTANT — this is a CLIENT-SIDE flag, not entitlement enforcement.
   Anyone can set it from the console. It is fine for launching and for
   measuring how many people hit the paywall, but before you take real money
   see "Wiring up real subscriptions" in README.md.
   ========================================================================== */

const CONFIG = {
  // Paste your Stripe / Lemon Squeezy / Paddle payment link here.
  checkoutUrl: "https://buy.stripe.com/REPLACE_ME",
  // Where customers manage or cancel (Stripe customer portal link).
  portalUrl: "https://billing.stripe.com/p/login/REPLACE_ME",
  storageKey: "trim.tier",
};

function readTier() {
  const q = new URLSearchParams(location.search);
  try {
    // Returning from checkout. Replace this with a server check — see README.
    if (q.get("checkout") === "success") localStorage.setItem(CONFIG.storageKey, "pro");
    if (q.get("tier") === "pro") localStorage.setItem(CONFIG.storageKey, "pro");
    if (q.get("tier") === "free") localStorage.removeItem(CONFIG.storageKey);
    return localStorage.getItem(CONFIG.storageKey) === "pro" ? "pro" : "free";
  } catch (e) {
    return q.get("tier") === "pro" ? "pro" : "free";
  }
}

function TopBar({ tier, onUpgrade }) {
  return (
    <div className="topbar">
      <a className="brand" href="./index.html">TRIM</a>
      <span className={"badge " + (tier === "pro" ? "pro" : "")}>
        {tier === "pro" ? "Pro" : "Easy Trim · free"}
      </span>
      {tier === "pro"
        ? <a className="tb-btn" href={CONFIG.portalUrl}>Manage</a>
        : <button className="tb-btn go" onClick={onUpgrade}>Upgrade</button>}
    </div>
  );
}

function Shell() {
  const [tier, setTier] = useState(readTier);
  const onUpgradeRef = React.useRef(() => {});

  useEffect(() => {
    // If you add a backend, verify entitlement here and setTier from the answer.
    // fetch("/api/me").then(r => r.json()).then(d => setTier(d.pro ? "pro" : "free"));
    const q = new URLSearchParams(location.search);
    if (q.has("checkout")) history.replaceState({}, "", location.pathname);
    // arriving from the "Go Pro" button on the landing page
    if (q.get("upgrade") === "1" && readTier() !== "pro") setTimeout(() => onUpgradeRef.current(), 250);
  }, []);

  const onUpgrade = useCallback(() => {
    if (CONFIG.checkoutUrl.includes("REPLACE_ME")) {
      // Demo mode so the site is usable before payments are connected.
      const ok = confirm(
        "Checkout is not connected yet.\n\nUnlock Pro locally for this browser so you can try it?"
      );
      if (ok) { try { localStorage.setItem(CONFIG.storageKey, "pro"); } catch (e) {} setTier("pro"); }
      return;
    }
    location.href = CONFIG.checkoutUrl;
  }, []);

  onUpgradeRef.current = onUpgrade;

  return (
    <>
      <TopBar tier={tier} onUpgrade={onUpgrade} />
      <App tier={tier} onUpgrade={onUpgrade} />
    </>
  );
}

createRoot(document.getElementById("root")).render(<Shell />);
