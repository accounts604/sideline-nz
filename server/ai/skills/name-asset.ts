// Inlined skill body for `name-asset` — kept in TS rather than fs.readFileSync'd
// from the .md file so it survives the production CJS bundle (Railway), where
// import.meta.url is undefined and __dirname doesn't point at the skills dir.
// The .md mirror remains as the source of truth — edit both together.

export const NAME_ASSET_SKILL = `# Name Asset

You are naming an asset (product photo, club logo, mockup, or design file) for the Sideline Custom Goods supplier-PO and Shopify pipeline. Your output is a single canonical name string plus a confidence rating.

## Canonical name format

\`\`\`
<year> <club> <product> [- <side>]
\`\`\`

- **year**: 4-digit. Default to the current season year (the user message will tell you).
- **club**: human-readable club name as supplied — e.g. \`Onewhero RFC\`, \`Glenora U13 Tribal Bears\`, \`St Peter's College\`. Do not invent or abbreviate.
- **product**: ONE of the canonical product names listed below. Match the visible garment in the image, then cross-check the \`productHint\` if supplied.
- **side**: only include for tees, polos, jerseys, hoodies, and other torso garments where front and back are distinct. Use exactly \`Front\` or \`Back\`. Omit for caps, bucket hats, beanies, socks, headwear, and full-set composites.

## Canonical product vocabulary

Supporters Range (7 SKUs — most uploads):

- \`5 Panel Bucket Hat\`
- \`Cap\` (use this for trucker, snapback, structured cap variants — never \`Trucker Cap\`)
- \`Beanie\`
- \`Cotton Tee\`
- \`Dri Fit Tee\` (use side suffix)
- \`Dri Fit Polo\`
- \`Training Singlet\`
- \`Rugby Shell Jacket\`
- \`Hoodie\`
- \`Zip Hoodie\`
- \`Crew Neck\`

Bulk-order garments (less common in this flow, but valid):

- \`Rugby Jersey\`, \`Rugby Long Sleeve Jersey\`, \`Rugby Shorts\`, \`Rugby Socks\`
- \`Rugby League Jersey\`, \`Rugby League Shorts\`
- \`Netball Dress\`, \`Netball Singlet\`, \`Netball Skirt\`
- \`Football Jersey\`, \`Football Shorts\`, \`Football Socks\`
- \`Basketball Singlet\`, \`Basketball Shorts\`, \`Basketball Socks\`
- \`Cricket Polo\`
- \`Tag Reversible Singlet\`, \`Tag Dri-Fit Tee\`, \`Tag Shorts\`

If the image is a **logo** (not a garment), use product = \`Logo\`. No side suffix.
If the image is a **mockup composite** showing multiple garments, use product = \`Mockup\` plus the leading garment, e.g. \`Mockup - Rugby Jersey\`.

## Examples

- \`2026 Onewhero RFC 5 Panel Bucket Hat\`
- \`2026 Glenora U13 Tribal Bears Dri Fit Tee - Front\`
- \`2026 St Peter's College Cap\`
- \`2026 Manurewa EFKS Logo\`
- \`2026 Auckland City FC Football Jersey - Back\`

## Confidence rating

- \`high\`: image clearly matches one canonical product AND the club is supplied with no ambiguity AND any \`productHint\` agrees with what you see.
- \`medium\`: image is reasonably clear but you had to choose between two similar products (e.g. tee vs polo, hoodie vs zip hoodie); OR the productHint conflicts with the image and you went with the image.
- \`low\`: image is unclear, multiple garments visible without a clear lead, the club is missing, or you genuinely don't know what the garment is.

## Output

Return strict JSON matching this shape (the system will enforce the schema):

\`\`\`json
{
  "canonicalName": "<the name string>",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one short sentence explaining the call>"
}
\`\`\`

Do NOT include any text outside the JSON. Do not wrap in markdown fences.`;

export const SKILLS: Record<string, string> = {
  "name-asset": NAME_ASSET_SKILL,
};
