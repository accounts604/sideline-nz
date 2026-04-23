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
  | "rain-jacket"
  | "tracksuit-jacket"
  | "baseball-jersey"
  | "rugby-jersey"
  | "socks"
  | "beanie";

export const SIZE_CHART_LABELS: Record<SizeChartType, string> = {
  tshirt: "T-Shirts / Polos",
  hoodie: "Hoodies / Crew Necks",
  singlet: "Singlets",
  shorts: "Shorts",
  trackpants: "Trackpants",
  "rain-jacket": "Rain / Wet Weather Jackets",
  "tracksuit-jacket": "Tracksuit / Softshell Jackets",
  "baseball-jersey": "Baseball Jersey",
  "rugby-jersey": "Rugby Jersey + Shorts",
  socks: "Socks",
  beanie: "Beanie (Pom-Pom)",
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
  "rugby-jersey": [
    {
      title: "Rugby Jersey",
      headers: ["", "Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16/XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"],
      rows: [
        { label: "A. ½ Chest", values: [35,37,39,41,43,45,43.5,46,48.5,51,53.5,56,58.5,61,63.5,66,68.5] },
        { label: "B. Length", values: [50,54,58,62,66,70,72,74,76,78,80,82,84,86,88,90,92] },
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
};

// Suggest the best-fit size chart for a product type from shared/product-catalog.ts.
// Falls back to tshirt if no match found.
const PRODUCT_TO_CHART: Record<string, SizeChartType> = {
  "rugby-match-jersey": "rugby-jersey",
  "rugby-long-sleeve": "tshirt",
  "rugby-shorts": "rugby-jersey", // rugby shorts table is inside the rugby-jersey entry
  "rugby-socks": "socks",
  "league-jersey": "tshirt",
  "league-shorts": "shorts",
  "netball-dress": "tshirt",
  "netball-singlet": "singlet",
  "netball-skirt": "shorts",
  "netball-bike-shorts": "shorts",
  "netball-spanks": "shorts",
  "tag-reversible-singlet": "singlet",
  "tag-dri-fit-tee": "tshirt",
  "tag-shorts": "shorts",
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
  "quarter-zip": "tracksuit-jacket",
  "crew-neck": "hoodie",
  "softshell-jacket": "rain-jacket",
  "puffer-jacket": "rain-jacket",
  "wet-weather-jacket": "rain-jacket",
  "gameday-jacket": "tracksuit-jacket",
  "anthem-jacket": "tracksuit-jacket",
  "rugby-shell-jacket": "rain-jacket",
  "windbreaker-jacket": "rain-jacket",
  "stadium-jacket": "tracksuit-jacket",
  "tracksuit": "tracksuit-jacket",
  "rugby-set": "rugby-jersey",
  "basketball-socks": "socks",
  "scarf": "tshirt",
  "shoe-bag": "tshirt",
  "american-football-jersey": "tshirt",
  "supporters-tee": "tshirt",
  "supporters-polo": "tshirt",
  "supporters-singlet": "singlet",
  "bucket-hat": "tshirt", // no specific hat chart; won't render in PO
  "cap-structured": "tshirt",
  "cap-snapback": "tshirt",
  "beanie": "beanie",
  "kit-bag": "tshirt",
  "backpack": "tshirt",
  "drawstring-bag": "tshirt",
  "baseball-jersey": "baseball-jersey",
};

// Diagram images — path relative to public root. Used in the PO PDF to show
// the measurement reference illustration alongside the numbers table.
export const SIZE_CHART_DIAGRAMS: Record<SizeChartType, string> = {
  tshirt: "/size-charts/tshirt-diagram.png",
  hoodie: "/size-charts/hoodie-diagram.png",
  singlet: "/size-charts/singlet-diagram.png",
  shorts: "/size-charts/shorts-diagram.png",
  trackpants: "/size-charts/trackpants-diagram.png",
  "rain-jacket": "/size-charts/rain-jacket-diagram.png",
  "tracksuit-jacket": "/size-charts/tracksuit-jacket-diagram.png",
  "baseball-jersey": "/size-charts/baseball-jersey-diagram.png",
  "rugby-jersey": "/size-charts/rugby-jersey-diagram.png",
  socks: "/size-charts/socks-diagram.png",
  beanie: "/size-charts/beanie-diagram.png",
};

export function suggestSizeChart(productType: string | null | undefined): SizeChartType {
  if (!productType) return "tshirt";
  return PRODUCT_TO_CHART[productType] || "tshirt";
}

export function getSizeChartTables(chartType: SizeChartType): SizeTable[] {
  return SIZE_CHART_DATA[chartType] || SIZE_CHART_DATA.tshirt;
}
