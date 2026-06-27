// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { isDomSnapshotProbablyStale, type StalenessSnapshot } from "./dom-staleness";

describe("DOM snapshot staleness detection", () => {
  it("rejects a route snapshot whose clean DOM contains another view", () => {
    const snapshot: StalenessSnapshot = {
      route: "/settings/team",
      title: "Team settings",
      elements: [
        {
          visibility: "visible",
          text: "Home Activity Usage Invoices Recent reports"
        }
      ],
      uiFacts: [{ id: "home", label: "Home", text: "Home" }],
      offscreenUiFacts: [],
      pageMeta: {
        title: "Team settings",
        headings: ["Home"],
        landmarks: ["main: Home"],
        selectedNav: ["settings"]
      }
    };

    expect(isDomSnapshotProbablyStale(snapshot, { livePrimaryControlCount: 8 })).toBe(true);
  });

  it("accepts a route snapshot when route-specific content is present in elements", () => {
    const snapshot: StalenessSnapshot = {
      route: "/settings/team",
      title: "Team settings",
      elements: [
        {
          visibility: "visible",
          text: "Settings Profile Team Billing Security"
        },
        {
          visibility: "visible",
          text: "Team settings Members Invitations Roles"
        }
      ],
      uiFacts: [{ id: "members", label: "Members", text: "Members" }],
      offscreenUiFacts: [],
      pageMeta: {
        title: "Team settings",
        headings: ["Team settings"],
        landmarks: ["main: Team settings", "aside: Settings"],
        selectedNav: ["Team"]
      }
    };

    expect(isDomSnapshotProbablyStale(snapshot, { livePrimaryControlCount: 8 })).toBe(false);
  });

  it("does not reject generic home content on the home route", () => {
    const snapshot: StalenessSnapshot = {
      route: "/home",
      title: "Home",
      elements: [
        {
          visibility: "visible",
          text: "Home Activity Reports Shortcuts"
        }
      ],
      uiFacts: [{ id: "new-report", label: "New report", text: "New report" }],
      offscreenUiFacts: [],
      pageMeta: {
        title: "Home",
        headings: ["Home"],
        landmarks: ["main: Home"],
        selectedNav: ["Home"]
      }
    };

    expect(isDomSnapshotProbablyStale(snapshot, { livePrimaryControlCount: 4 })).toBe(false);
  });
});
