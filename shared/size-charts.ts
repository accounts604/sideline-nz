// Sideline NZ sizing charts — single source of truth.
// Mirrors the data from client/src/pages/size-chart.tsx (the public site)
// so the admin PO PDF, garment-line detail, and supplier dispatch email all
// reference the same measurements.
//
// Each garment type has one or more SizeTable (e.g. Youth/Adult + Women).
// The admin can select a sizeChartType per garment line; the PO PDF renders
// the matching table(s).

export interface SizeRow {
  label: string;
  values: (string | number)[];
}

export interface SizeTable {
  title: string;
  headers: string[];
  rows: SizeRow[];
  tolerance: string;
}

export type SizeChartType =
  | "tshirt"
  | "hoodie"
  | "singlet"
  | "shorts"
  | "trackpants"
  | "jacket"
  | "stadium-jacket"
  | "rain-jacket"
  | "jacket-hooded"
  | "tracksuit-jacket"
  | "baseball-jersey"
  | "rugby-jersey"
  | "rugby-jersey-supporters"
  | "rugby-long-sleeve"
  | "socks"
  | "headwear"
  | "beanie"
  | "none"; // "none" → skip the Sizing Guide section entirely on the PO

export const SIZE_CHART_LABELS: Record<SizeChartType, string> = {
  tshirt: "T-Shirts / Polos",
  hoodie: "Hoodies / Crew Necks",
  singlet: "Singlets",
  shorts: "Shorts",
  trackpants: "Trackpants",
  jacket: "Jackets — Softshell / Shell / Windbreaker / ¼-Zip",
  "stadium-jacket": "Stadium Jacket (Longline)",
  "rain-jacket": "Rain / Wet Weather Jackets (legacy)",
  "jacket-hooded": "Jackets — Hooded / Zip",
  "tracksuit-jacket": "Tracksuit / Softshell Jackets (legacy)",
  "baseball-jersey": "Baseball Jersey",
  "rugby-jersey": "Rugby Kit — Playing Cut (Sports Fit)",
  "rugby-jersey-supporters": "Rugby Kit — Supporters Cut (Replica Fit)",
  "rugby-long-sleeve": "Rugby Long Sleeve Jersey (Classic Relaxed)",
  socks: "Socks",
  headwear: "Headwear — Bucket Hat / 5-Panel Cap",
  beanie: "Beanie (Pom-Pom)",
  none: "",
};

export const SIZE_CHART_DATA: Record<SizeChartType, SizeTable[]> = {
  tshirt: [
    {
      title: "Youth / Adult Unisex",
      headers: ["", "Y2", "Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
      rows: [
        { label: "A. ½ Chest", values: [32,34,36,38,40,42,44,46,49,51,53,56,58,61,64,67,70] },
        { label: "B. Centre Back", values: [42,46,50,54,57,62,66,70,66,68,70,73,75,77,79,80,81] },
        { label: "B. Centre Back (Tall)", values: [45,49,53,57,60,65,69,73,71,73,75,78,80,82,84,85,86] },
      ],
      tolerance: "± 1.0cm",
    },
    {
      title: "Women",
      headers: ["", "WXXS", "WXS", "WS", "WM", "WL", "WXL", "W2XL", "W3XL", "W4XL"],
      rows: [
        { label: "A. ½ Chest", values: [40,42,45,48,51,53,55,56,59] },
        { label: "B. Centre Back", values: [58,60,62,64,67,69,71,73,74] },
        { label: "B. Centre Back (Tall)", values: [63,65,67,69,72,74,76,78,79] },
      ],
      tolerance: "± 1.0cm",
    },
  ],
  hoodie: [
    {
      title: "Youth / Adult Unisex",
      headers: ["", "Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
      rows: [
        { label: "A. Centre Back Length", values: [46,49,52,55,58,61,64,66,68,70,72,74,76,78,80,82] },
        { label: "B. ½ Chest", values: [38,40,42,44,46,48,50,52,55,58,61,64,67,70,73,76] },
        { label: "C. Sleeve (neck to cuff)", values: [58,61,64,65,68,70,72,74,76,78,80,82,84,86,88,"—"] },
      ],
      tolerance: "± 2.0cm",
    },
    {
      title: "Women",
      headers: ["", "W3XS", "WXXS", "WXS", "WS", "WM", "WL", "WXL", "W2XL", "W3XL", "W4XL", "W5XL"],
      rows: [
        { label: "A. Centre Back Length", values: [56,59,62,65,68,71,74,77,80,83,86] },
        { label: "B. ½ Chest", values: [43,45.5,48,50.5,54.5,58.5,62.5,66.5,70.5,74.5,78.5] },
        { label: "C. Sleeve (neck to cuff)", values: [65,68,71,73,75,77,79,82,85,88,91] },
      ],
      tolerance: "± 2.0cm",
    },
  ],
  singlet: [
    {
      title: "Youth",
      headers: ["", "Y2", "Y3", "Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16"],
      rows: [
        { label: "A. ½ Chest", values: [33.5,35.5,37.5,39.5,41.5,43.5,45.5,47.5,49.5] },
        { label: "B. Back Length", values: [40.5,44.5,48.5,52.5,56.5,60.5,64.5,68.5,72.5] },
        { label: "B. Back Length (Tall)", values: [43.5,47.5,51.5,55.5,59.5,63.5,67.5,71.5,75.5] },
      ],
      tolerance: "± 1.0cm",
    },
    {
      title: "Adult Unisex",
      headers: ["", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
      rows: [
        { label: "A. ½ Chest", values: [52,54.5,57,59.5,62,64.5,67,69.5,72] },
        { label: "B. Back Length", values: [72.5,74.5,76.5,78.5,80.5,84.5,86,"—","—"] },
        { label: "B. Back Length (Tall)", values: [77.5,79.5,81.5,83.5,85.5,89.5,91,93,95] },
      ],
      tolerance: "± 1.0cm",
    },
  ],
  shorts: [
    {
      title: "Adult Football Shorts",
      headers: ["", "XS", "S", "M", "L", "XL", "2XL", "3XL"],
      rows: [
        { label: "A. ½ Waist", values: [32.5,36.4,40.3,44.2,48.1,52.0,55.9] },
        { label: "B. ½ Hip", values: [41.2,45.0,48.8,52.6,56.4,60.2,64.0] },
        { label: "C. Leg Opening", values: [49.7,55.7,61.7,67.6,73.6,80.0,85.5] },
        { label: "D. Front Rise", values: [35.5,36.0,36.5,37.0,37.5,38.0,38.5] },
        { label: "E. Back Rise", values: [41.5,42.0,42.5,43.0,43.5,44.0,44.5] },
        { label: "F. Inseam", values: [14.0,14.0,14.0,14.0,14.0,14.0,14.0] },
      ],
      tolerance: "± 1.0cm",
    },
    {
      title: "Youth Football Shorts",
      headers: ["", "YS", "YM", "YL", "YXL"],
      rows: [
        { label: "A. ½ Waist", values: [30.0,32.5,35.1,37.7] },
        { label: "B. ½ Hip", values: [36.0,38.5,41.0,43.5] },
        { label: "C. Leg Opening", values: [45.9,49.8,53.7,57.6] },
        { label: "D. Front Rise", values: [25.9,30.0,34.0,38.0] },
        { label: "E. Back Rise", values: [29.9,34.0,38.0,42.0] },
        { label: "F. Inseam", values: [12.0,12.0,12.0,12.0] },
      ],
      tolerance: "± 1.0cm",
    },
  ],
  trackpants: [
    {
      title: "Youth / Adult Unisex",
      headers: ["", "Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
      rows: [
        { label: "A. ½ Waist", values: [23,25.5,28,30.5,33,35.5,38,40,43,45,48,50,53,55,58] },
        { label: "B. Outside Leg (incl W/B)", values: [70,75,80,85,90,95,99,100,101,102,103,104,105,106,107] },
        { label: "C. ½ Leg Opening (Regular)", values: [13,14,15,17,18,20,21,22,23,24,25,26,27,28,29] },
        { label: "C. ½ Leg Opening (Tapered)", values: [10,11,12,13,14,15,16,17,18,19,20,21,22,23,24] },
      ],
      tolerance: "± 1.5cm",
    },
    {
      title: "Women",
      headers: ["", "WXXS", "WXS", "WS", "WM", "WL", "WXL", "W2XL", "W3XL", "W4XL", "W5XL"],
      rows: [
        { label: "A. ½ Waist Relaxed", values: [32,34,36,38,40,42,44,46,48,50] },
        { label: "B. Outside Leg (incl W/B)", values: [96,98,100,102,104,106,108,110,112,114] },
        { label: "C. ½ Leg Opening (Regular)", values: [20,21,22,23,24,25,26,27,28,29] },
        { label: "C. ½ Leg Opening (Tapered)", values: [12.5,13,13.5,14,14.5,15,15,15.5,15.5,16] },
      ],
      tolerance: "± 1.5cm",
    },
  ],
  // ONE jacket chart for every standard jacket style (softshell, rugby shell,
  // windbreaker, quarter-zip, gameday/anthem, tracksuit) so the same size fits
  // the same across the range. Adult chest/length follow the NZ-standard
  // contact-top reference (locked 2026-07-22); 4XL interpolated; sleeve values
  // carried from the previous chart pending sizing-kit verification.
  jacket: [
    {
      title: "Jackets — All Styles (Youth / Adult Unisex)",
      headers: ["", "YXS", "YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
      rows: [
        { label: "A. ½ Chest", values: [41,44,47,50,53,56,59,62,65,68,72,76,79,82] },
        { label: "B. Length (HSP to hem)", values: [54,58,62,66,70,71,75,77,79,81,83,85,87,89] },
        { label: "C. Sleeve (neck to cuff)", values: [57,60,62,65,68,71,74,77,81,84,87,90,93,"—"] },
      ],
      tolerance: "± 2.0cm",
    },
  ],
  // Longline sub coat — below the knee. Widths/lengths follow the NZ-standard
  // sideline jacket reference (locked 2026-07-22). No 4XL/6XL columns by design.
  "stadium-jacket": [
    {
      title: "Stadium Jacket — Longline (Adults)",
      headers: ["", "XS", "S", "M", "L", "XL", "2XL", "3XL", "5XL", "7XL"],
      rows: [
        { label: "A. ½ Chest", values: [55,58,61,64,67,70,73,79,85] },
        { label: "B. Length (HSP to hem)", values: [100,104,106,108,110,112,114,118,122] },
      ],
      tolerance: "± 2.0cm",
    },
  ],
  "jacket-hooded": [
    {
      title: "Mens",
      headers: ["", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"],
      rows: [
        { label: "A. Chest", values: [58,60,63,66,69,72,75,78,81,84] },
        { label: "B. Length", values: [72,74,76,79,81,84,87,90,93,95] },
        { label: "C. Sleeve", values: [78,80,84,85,88,90,92,92,92,92] },
      ],
      tolerance: "\u00b1 2.0cm",
    },
    {
      title: "Womens",
      headers: ["", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"],
      rows: [
        // 6XL chest printed as 71 on the supplier's source chart — clear typo between 78 and 84; transcribed as 81.
        { label: "A. Chest", values: [58,60,63,66,69,72,75,78,81,84] },
        { label: "B. Length", values: [72,74,76,78,80,82,84,86,88,90] },
        { label: "C. Sleeve", values: [78,80,82,84,86,88,90,90,90,90] },
      ],
      tolerance: "\u00b1 2.0cm",
    },
    {
      title: "Kids",
      headers: ["", "K6", "K8", "K10", "K12", "K14", "K16"],
      rows: [
        { label: "A. Chest", values: [40,42,44,47,50,54] },
        { label: "B. Length", values: [54,56,60,63,66,69] },
        { label: "C. Sleeve", values: [60,62,64,67,70,74] },
      ],
      tolerance: "\u00b1 2.0cm",
    },
  ],
  "rain-jacket": [
    {
      title: "Youth / Adult Unisex",
      headers: ["", "YXS", "YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"],
      rows: [
        { label: "A. ½ Chest", values: [41,44,47,50,53,55,59,62,65,68,71,74,77] },
        { label: "B. Centre Back Length", values: [54,58,62,66,70,74,78.5,80,81.5,83,84.5,87,90] },
        { label: "C. Sleeve (neck to cuff)", values: [57,60,62,65,68,71,74,77,81,84,87,90,93] },
      ],
      tolerance: "± 2.0cm",
    },
    {
      title: "Women",
      headers: ["", "W3XS", "WXXS", "WXS", "WS", "WM", "WL", "WXL", "W2XL", "W3XL", "W4XL", "W5XL"],
      rows: [
        { label: "A. ½ Chest", values: [43,45.5,48,50.5,54.5,58.5,62.5,66.5,70.5,74.5,78.5] },
        { label: "B. Centre Back Length", values: [60,63.5,67,70.5,74,77.5,81,84.5,88,91,94] },
        { label: "C. Sleeve (neck to cuff)", values: [65,68,71,73,75,77,79,82,85,88,91] },
      ],
      tolerance: "± 2.0cm",
    },
  ],
  "tracksuit-jacket": [
    {
      title: "Youth / Adult Unisex",
      headers: ["", "4", "6", "8", "10", "12", "14", "S", "M", "L", "XL", "2XL", "3XL", "4XL"],
      rows: [
        { label: "A. Length", values: [51,55,58,61,64,67,70,73,76,79,82,85,"—"] },
        { label: "B. ½ Chest", values: [41,44,47,50,53,56,59,62,65,68,71,74,77] },
        { label: "C. Sleeve Length", values: [57,60,62,65,68,71,74,77,81,84,87,90,93] },
      ],
      tolerance: "± 2.0cm",
    },
    {
      title: "Women",
      headers: ["", "W3XS", "WXXS", "WXS", "WS", "WM", "WL", "WXL", "W2XL", "W3XL", "W4XL", "W5XL"],
      rows: [
        { label: "A. Length", values: [56,59,62,65,68,71,74,77,80,83,86] },
        { label: "B. ½ Chest", values: [43,45.5,48,50.5,54.5,58.5,62.5,66.5,70.5,74.5,78.5] },
        { label: "C. Sleeve Length", values: [65,68,71,73,75,77,79,82,85,88,91] },
      ],
      tolerance: "± 2.0cm",
    },
  ],
  "baseball-jersey": [
    {
      title: "Youth / Adult Unisex",
      headers: ["", "Y2", "Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
      rows: [
        { label: "A. ½ Chest", values: [32,34,36,38,40,42,44,46,49,51,53,56,58,61,64,67,70] },
        { label: "B. Centre Back", values: [42,46,50,54,57,62,66,70,66,68,70,73,75,77,79,80,81] },
        { label: "B. Centre Back (Tall)", values: [45,49,53,57,60,65,69,73,71,73,75,78,80,82,84,85,86] },
      ],
      tolerance: "± 1.5cm",
    },
    {
      title: "Women",
      headers: ["", "WXXS", "WXS", "WS", "WM", "WL", "WXL", "W2XL", "W3XL", "W4XL"],
      rows: [
        { label: "A. ½ Chest", values: [40,42,45,48,51,53,55,56,59] },
        { label: "B. Centre Back", values: [58,60,62,64,67,69,71,73,74] },
        { label: "B. Centre Back (Tall)", values: [63,65,67,69,72,74,76,78,79] },
      ],
      tolerance: "± 1.5cm",
    },
  ],
  // Playing cut = the sports-fit production chart approved with the factory
  // 2026-07-22 (snug chest, shorter athletic body). Kids labels K6–K16 on the
  // source chart map 1:1 to Y6–Y16 here.
  "rugby-jersey": [
    {
      title: "Rugby Jersey",
      headers: ["", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"],
      rows: [
        { label: "A. ½ Chest", values: [38,40,42,44,46,48,48,50,52,54,56,59,62,64,66,68] },
        { label: "B. Length", values: [45,47,50,53,56,58,60,62,64,66,68,70,70,70,70,72] },
      ],
      tolerance: "± 2.0cm",
    },
    {
      title: "Rugby Shorts",
      headers: ["", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"],
      rows: [
        { label: "A. ½ Waist", values: [26,27,28,30,32,34,36,38,40,42,44,47,49,52,55,58] },
        { label: "B. Outside Leg", values: [24,26,28,30,30,31,32,33,34,35,36,37,38,38,38,38] },
      ],
      tolerance: "± 2.0cm",
    },
  ],
  // Supporters cut = the original relaxed Sideline chart — longer body, fuller
  // fit. Offered as the alternative jersey cut at order time.
  "rugby-jersey-supporters": [
    {
      // Widened to NZ replica-jersey dimensions (Romero call 2026-07-23): the
      // old cut measured about 9cm narrower than the replica jerseys
      // supporters own, at every size. Youth regraded on the same curve;
      // Y16/XS composite column split into separate sizes.
      title: "Rugby Jersey",
      headers: ["", "Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"],
      rows: [
        { label: "A. ½ Chest", values: [35,37.5,40,42.5,45,47.5,50,52.5,55,57.5,60,62.5,65,67.5,70,72.5,75,77.5] },
        { label: "B. Length", values: [52,55,58,61,64,67,70,73,75,77,79,81,83,84,85,86,87,88] },
      ],
      tolerance: "± 2.0cm",
    },
    {
      title: "Rugby Shorts",
      headers: ["", "Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16/XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"],
      rows: [
        { label: "A. ½ Waist", values: [26,28,30,32,34,36,40,42,44,45,48,50,52,54,56,58,"—"] },
        { label: "B. Outside Leg", values: [27.5,28.5,29.5,30.5,31.5,32.5,33.5,34.5,35.5,36.5,37.5,38.5,39.5,40.5,41.5,42.5,43.5] },
      ],
      tolerance: "± 2.0cm",
    },
  ],
  // Long sleeve rugby jersey: classic relaxed rugby jersey proportions from
  // the NZ-standard reference (locked 2026-07-23) — the roomy chest ALSO
  // matches Romero's 2-sizes-up oversized call, and the long body (72-92cm)
  // is what a size-shift on the short sports-fit chart could never deliver.
  // 6XL/7XL extrapolated on the same grading; sleeves from factory patterns.
  "rugby-long-sleeve": [
    {
      title: "Rugby Long Sleeve Jersey — Classic Relaxed Fit (Adults)",
      headers: ["", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"],
      rows: [
        { label: "A. ½ Chest", values: [48,51,54,57,60,63,66,69,72,75,78] },
        { label: "B. Length (HSP to hem)", values: [72,74,76,78,80,82,84,86,88,90,92] },
        { label: "C. Sleeve (neck to cuff)", values: [65,68,71,74,76,78,80,82,84,86,88] },
      ],
      tolerance: "± 2.0cm",
    },
    {
      title: "Rugby Long Sleeve Jersey — Youth",
      headers: ["", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16"],
      rows: [
        { label: "A. ½ Chest", values: [42,44,46,48,48,50] },
        { label: "B. Length", values: [50,53,56,58,60,62] },
        { label: "C. Sleeve (neck to cuff)", values: [50,53,56,59,62,65] },
      ],
      tolerance: "± 2.0cm",
    },
  ],
  // One-size adult headwear. The 62cm circumference is the locked Sideline
  // spec (standard adult head, generous fit); brim/crown dims are industry
  // standard pending verification off the first supplier sample.
  headwear: [
    {
      // B-Series two-size reference (S/M 56.5 fits 53.5-56.5, L/XL 60 fits
      // 57-60) scaled at 62/60 so the top size hits the locked 62cm.
      title: "Bucket Hat — Two Sizes",
      headers: ["", "S/M", "L/XL"],
      rows: [
        { label: "A. Circumference (inner band)", values: [58.5, 62] },
        { label: "Fits Head (cm)", values: ["55.5–58.5", "59–62"] },
      ],
      tolerance: "± 1.5cm",
    },
    {
      // Five-panel essential reference (10 / 18 / 6.5 / 55-58) scaled to the
      // locked 62cm perimeter at the same rate (× 62/58).
      title: "5-Panel Cap — One Size",
      headers: ["", "One Size"],
      rows: [
        { label: "A. Height", values: [10.7] },
        { label: "B. Width", values: [19.2] },
        { label: "C. Length (peak)", values: [6.9] },
        { label: "D. Perimeter", values: [62] },
      ],
      tolerance: "± 1.5cm",
    },
  ],
  beanie: [
    {
      title: "Pom-Pom Beanie — One Size Fits Most",
      headers: ["", "One Size"],
      rows: [
        { label: "A. Width (½ flat)", values: [20.8] },
        { label: "B. Height (excl pom-pom)", values: [23.5] },
        { label: "C. Cuff Depth", values: [7.6] },
        { label: "Pom-Pom Diameter", values: [7.6] },
        { label: "Circumference (stretched)", values: ["45–48"] },
        { label: "Total Height (knit)", values: [30.5] },
      ],
      tolerance: "± 1.0cm",
    },
  ],
  socks: [
    {
      title: "Rugby Socks",
      headers: ["", "XXS", "XS", "S", "M", "L", "XL", "XXL"],
      rows: [
        { label: "A. Heel", values: [14,15,18,21,24,27,29] },
        { label: "B. Heel Flap", values: [34,37,40,45,50,54,57] },
        { label: "C. Cuff", values: [8,8,9,9,10,10,10] },
        { label: "D. Ribbed Top", values: [10,10,10,12,12,12,12] },
        { label: "Shoe Size", values: ["9-12","13-3","2-7","7-11","11-14","—","—"] },
      ],
      tolerance: "± 2.0cm",
    },
  ],
  none: [],
};

// Suggest the best-fit size chart for a product type from shared/product-catalog.ts.
// Returns "none" if we don't have a verified chart — the PO renderer will
// omit the Sizing Guide section entirely rather than guess wrong.
const PRODUCT_TO_CHART: Record<string, SizeChartType> = {
  // Puffin cost-key productTypes — what quote-to-po stamps on order_items.
  // Without these the whole rugby set fell through to "none" (one-size).
  "rugby-jersey": "rugby-jersey",
  "rugby-short-lycra": "rugby-jersey",
  "sublimated-socks": "socks",
  "t-shirt": "tshirt",
  "polo-shirt": "tshirt",
  "hoodie-cotton-poly": "hoodie",
  "hoodie-zip-cotton-poly": "hoodie",
  "jumper-sweatshirt": "hoodie",
  "winter-softshell": "jacket",
  "jacket-half-zipper": "jacket",
  "jacket-mesh-lining": "jacket",
  // One-size by default (Romero rule): hats and scarfs only.
  "cap": "headwear",
  "bucket-hat": "headwear",
  "rugby-match-jersey": "rugby-jersey",
  "rugby-long-sleeve": "rugby-long-sleeve",
  "rugby-shorts": "rugby-jersey", // rugby shorts table is inside the rugby-jersey entry
  "rugby-socks": "socks",
  "league-jersey": "tshirt",
  "league-shorts": "shorts",
  "netball-dress": "tshirt",
  "netball-singlet": "singlet",
  "netball-skirt": "shorts",
  "netball-bike-shorts": "shorts",
  "netball-spanks": "none",          // no verified chart — Sizing Guide omitted on PO until one is added
  "tag-reversible-singlet": "none",  // no verified chart
  "tag-dri-fit-tee": "none",         // no verified chart
  "tag-shorts": "none",              // no verified chart
  "football-jersey": "tshirt",
  "football-shorts": "shorts",
  "football-socks": "socks",
  "basketball-singlet": "singlet",
  "basketball-shorts": "shorts",
  "cricket-polo": "tshirt",
  "cricket-trousers": "trackpants",
  "hockey-jersey": "tshirt",
  "hockey-skort": "shorts",
  "dri-fit-shirt": "tshirt",
  "dri-fit-polo": "tshirt",
  "cotton-tee": "tshirt",
  "training-singlet": "singlet",
  "gym-shorts": "shorts",
  "track-pants": "trackpants",
  "hoodie": "hoodie",
  "zip-hoodie": "hoodie",
  "quarter-zip": "jacket",
  "crew-neck": "hoodie",
  "softshell-jacket": "jacket",
  "puffer-jacket": "jacket",
  "wet-weather-jacket": "jacket",
  "gameday-jacket": "jacket",
  "anthem-jacket": "jacket",
  "rugby-shell-jacket": "jacket",
  "windbreaker-jacket": "jacket",
  "stadium-jacket": "stadium-jacket",
  "tracksuit": "jacket",
  "rugby-set": "rugby-jersey",
  "basketball-socks": "socks",
  "scarf": "none", // one-size by default (Romero rule)
  "shoe-bag": "tshirt",
  "american-football-jersey": "tshirt",
  "supporters-tee": "tshirt",
  "supporters-polo": "tshirt",
  "supporters-singlet": "singlet",
  "cap-structured": "headwear",
  "cap-snapback": "headwear",
  "beanie": "beanie",
  "kit-bag": "tshirt",
  "backpack": "tshirt",
  "drawstring-bag": "tshirt",
  "baseball-jersey": "baseball-jersey",
};

// Diagram images — path relative to public root. Used in the PO PDF to show
// the measurement reference illustration alongside the numbers table.
export const SIZE_CHART_DIAGRAMS: Record<SizeChartType, string> = {
  tshirt: "/size-charts/tshirt-diagram.svg",
  hoodie: "/size-charts/hoodie-diagram.svg",
  singlet: "/size-charts/singlet-diagram.svg",
  shorts: "/size-charts/shorts-diagram.svg",
  trackpants: "/size-charts/trackpants-diagram.svg",
  jacket: "/size-charts/jacket-diagram.svg",
  "stadium-jacket": "/size-charts/stadium-jacket-diagram.svg",
  "rain-jacket": "/size-charts/jacket-diagram.svg",
  "jacket-hooded": "/size-charts/jacket-diagram.svg",
  "tracksuit-jacket": "/size-charts/jacket-diagram.svg",
  "baseball-jersey": "/size-charts/baseball-jersey-diagram.svg",
  "rugby-jersey": "/size-charts/rugby-jersey-diagram.svg",
  "rugby-jersey-supporters": "/size-charts/rugby-jersey-diagram.svg",
  "rugby-long-sleeve": "/size-charts/rugby-ls-diagram.svg",
  socks: "/size-charts/socks-diagram.svg",
  headwear: "/size-charts/headwear-diagram.svg",
  beanie: "/size-charts/beanie-diagram.svg",
  none: "",
};

// "none" means "we don't have a verified chart for this garment — omit the
// Sizing Guide section from the PO instead of guessing wrong". Unknown
// productTypes also fall through to "none" so a typo or a new product ID
// never silently shows a t-shirt chart for a pair of shorts.
export function suggestSizeChart(productType: string | null | undefined): SizeChartType {
  if (!productType) return "none";
  return PRODUCT_TO_CHART[productType] || "none";
}

// Chart ids that existed briefly and may be stamped on old order_items rows.
// Normalized here so those rows keep rendering; remove once the DB is migrated.
const LEGACY_CHART_IDS: Record<string, SizeChartType> = {
  "kokonut-jacket": "stadium-jacket",
};

export function normalizeChartType(chartType: string | null | undefined): SizeChartType {
  if (!chartType) return "none";
  const t = LEGACY_CHART_IDS[chartType] || (chartType as SizeChartType);
  return SIZE_CHART_DATA[t] || t === "none" ? t : "none";
}

export function getSizeChartTables(chartType: SizeChartType): SizeTable[] {
  const t = normalizeChartType(chartType);
  if (t === "none") return [];
  return SIZE_CHART_DATA[t] || [];
}

// The size LABELS for a chart (column headers minus the leading measurement
// column), deduped and in order — e.g. ["Y2","Y4",...,"S","M",...]. Drives the
// customer size-quantity grid so each garment lists exactly its assigned chart.
export function chartSizes(chartType: SizeChartType): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of getSizeChartTables(chartType)) {
    for (const h of t.headers.slice(1)) {
      const s = (h || "").trim();
      if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    }
  }
  return out;
}

// Union of every size label across all charts — used to validate customer-
// submitted sizes server-side without hardcoding a list.
export const ALL_CHART_SIZES: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of Object.keys(SIZE_CHART_LABELS) as SizeChartType[]) {
    for (const s of chartSizes(k)) if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
})();
