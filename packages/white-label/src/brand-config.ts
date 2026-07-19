import { invariant } from "../../core/src/errors.ts";
import type { BusinessActivity } from "../../organizations/src/organization.ts";

export type ClientSurface = "professional_website" | "professional_app" | "client_portal";
export type HomeModule = "trust_bar" | "hero" | "primary_flow" | "quick_actions" | "inventory" | "services" | "passport" | "fleet" | "reviews" | "contact";

export interface BrandTokens {
  primary: string;
  primaryDark: string;
  ink: string;
  background: string;
  surface: string;
  border: string;
  radius: "square" | "soft" | "rounded";
  fontFamily: "system" | "modern" | "editorial";
}

export interface ClientExperienceConfig {
  version: 1;
  brand: { displayName: string; tagline?: string | undefined; logoUrl?: string | undefined; tokens: BrandTokens };
  locale: string;
  countryCode: string;
  activities: readonly BusinessActivity[];
  surfaces: readonly ClientSurface[];
  homeModules: readonly HomeModule[];
  primaryFlow: "workshop_quote" | "diagnostic" | "vehicle_valuation" | "rental_booking" | "body_shop_claim" | "service_booking";
  contact: { phone?: string | undefined; email?: string | undefined; bookingEnabled: boolean };
}

const HEX = /^#[0-9a-f]{6}$/i;
const REQUIRED_MODULES: HomeModule[] = ["hero", "primary_flow", "contact"];

export function defineClientExperience(input: ClientExperienceConfig): Readonly<ClientExperienceConfig> {
  invariant(input.brand.displayName.trim().length >= 2, "BRAND_NAME_REQUIRED", "Brand display name is required");
  for (const color of [input.brand.tokens.primary, input.brand.tokens.primaryDark, input.brand.tokens.ink, input.brand.tokens.background, input.brand.tokens.surface, input.brand.tokens.border]) invariant(HEX.test(color), "INVALID_BRAND_COLOR", "Brand colors must be six-digit hexadecimal values");
  invariant(input.activities.length > 0, "ACTIVITY_REQUIRED", "At least one activity is required");
  invariant(REQUIRED_MODULES.every(module => input.homeModules.includes(module)), "REQUIRED_HOME_MODULE", "Hero, primary flow and contact modules are required");
  invariant(input.contact.bookingEnabled || Boolean(input.contact.phone || input.contact.email), "CONTACT_CHANNEL_REQUIRED", "At least one contact channel is required");
  return Object.freeze({ ...input, activities: Object.freeze([...new Set(input.activities)]), surfaces: Object.freeze([...new Set(input.surfaces)]), homeModules: Object.freeze([...new Set(input.homeModules)]) });
}

export function recommendedModules(activities: readonly BusinessActivity[]): HomeModule[] {
  const modules = new Set<HomeModule>(["trust_bar", "hero", "primary_flow", "quick_actions", "passport", "reviews", "contact"]);
  if (activities.includes("vehicle_trade")) modules.add("inventory");
  if (activities.some(activity => ["workshop", "body_shop", "detailing", "inspection"].includes(activity))) modules.add("services");
  if (activities.includes("fleet") || activities.includes("rental")) modules.add("fleet");
  return [...modules];
}
