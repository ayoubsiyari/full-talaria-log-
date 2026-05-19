"use client";

import React from "react";
import { advancedViewLabel, type AdvancedDashboardViewId } from "./advancedDashboardNav";

export function AdvancedDashboardPlaceholder({ viewId }: { viewId: AdvancedDashboardViewId }) {
  return (
    <div className="bt-os-cluster bt-os-adv-placeholder">
      <h2 className="bt-os-adv-placeholder-title">{advancedViewLabel(viewId)}</h2>
      <p className="bt-os-adv-placeholder-text">
        This view is on the roadmap. Core session metrics are available under Performance Summary, Monte Carlo, and
        Distributions &amp; Risk.
      </p>
    </div>
  );
}
