import test from "node:test";
import assert from "node:assert/strict";
import { DomainError } from "../../core/src/errors.ts";
import { defineClientExperience, recommendedModules } from "../src/brand-config.ts";

const tokens = { primary: "#ed171d", primaryDark: "#bf0f14", ink: "#0d0d0f", background: "#ffffff", surface: "#f7f7f8", border: "#e5e6e8", radius: "soft" as const, fontFamily: "modern" as const };

test("builds one client configuration for web, app and portal", () => {
  const config = defineClientExperience({ version: 1, brand: { displayName: "Garage Horizon", tokens }, locale: "fr-FR", countryCode: "FR", activities: ["vehicle_trade", "workshop"], surfaces: ["professional_website", "professional_app", "client_portal"], homeModules: recommendedModules(["vehicle_trade", "workshop"]), primaryFlow: "workshop_quote", contact: { phone: "+33243000000", bookingEnabled: true } });
  assert.ok(config.homeModules.includes("inventory"));
  assert.ok(config.homeModules.includes("services"));
  assert.equal(config.surfaces.length, 3);
});

test("adapts modules to the professional activities", () => {
  assert.deepEqual(recommendedModules(["vehicle_trade"]), ["trust_bar", "hero", "primary_flow", "quick_actions", "passport", "reviews", "contact", "inventory"]);
  assert.ok(recommendedModules(["rental", "fleet"]).includes("fleet"));
});

test("rejects an incomplete or invalid brand configuration", () => {
  assert.throws(() => defineClientExperience({ version: 1, brand: { displayName: "X", tokens: { ...tokens, primary: "red" } }, locale: "fr-FR", countryCode: "FR", activities: ["workshop"], surfaces: ["professional_website"], homeModules: ["hero", "primary_flow", "contact"], primaryFlow: "workshop_quote", contact: { bookingEnabled: true } }), (error: unknown) => error instanceof DomainError);
});
