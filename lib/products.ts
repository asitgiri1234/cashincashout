/**
 * CICO CATALOG — frontend-only demo data.
 *
 * BRAND RULE: the "//" separator inside a product title is a brand signature.
 * Preserve it exactly, spaces included. Never normalise it to "/", "|", or "&".
 *
 * `estimated: true` marks a placeholder price (EST) that is not final.
 */

export type SizeScale = "apparel" | "footwear" | "belt";

export interface Product {
  id: string;
  slug: string;
  title: string;
  /** Price in whole INR (no paise). */
  price: number;
  /** True when the price is a placeholder pending final costing. */
  estimated: boolean;
  scale: SizeScale;
  sizes: string[];
  /** Pre-selected size used by the feed's one-tap ADD button. */
  defaultSize: string;
  images: {
    primary: string;
    alternate: string;
  };
  description: string;
}

const APPAREL_SIZES = ["S", "M", "L", "XL"];
const FOOTWEAR_SIZES = ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"];
const BELT_SIZES = ['28"', '30"', '32"', '34"', '36"', '38"'];

const SIZES_BY_SCALE: Record<SizeScale, string[]> = {
  apparel: APPAREL_SIZES,
  footwear: FOOTWEAR_SIZES,
  belt: BELT_SIZES,
};

/** Middle-of-the-run size per scale — what ADD drops in without asking. */
const DEFAULT_SIZE_BY_SCALE: Record<SizeScale, string> = {
  apparel: "M",
  footwear: "UK 9",
  belt: '32"',
};

type ProductSeed = Omit<Product, "id" | "sizes" | "defaultSize" | "images"> & {
  sizes?: string[];
};

const SEED: ProductSeed[] = [
  {
    slug: "boots",
    title: "BOOTS",
    price: 4499,
    estimated: false,
    scale: "footwear",
    description:
      "Full-grain upper on a blown rubber lug sole. Goodyear-welted, unlined, built to deform around the wearer.",
  },
  {
    slug: "raw-tire-belt",
    title: "RAW TIRE BELT",
    price: 1899,
    estimated: false,
    scale: "belt",
    description:
      "Reclaimed tire carcass cut into a single strap. Raw edge, blackened hardware, no two identical.",
  },
  {
    slug: "green-camo-brown-raw-denim-shirt",
    title: "GREEN CAMO // BROWN RAW DENIM SHIRT",
    price: 5299,
    estimated: true,
    scale: "apparel",
    description:
      "Panelled work shirt splitting green camo against 14oz brown raw denim. Boxy through the body, unwashed.",
  },
  {
    slug: "brown-camo-grey-raw-denim-shirt",
    title: "BROWN CAMO // GREY RAW DENIM SHIRT",
    price: 5299,
    estimated: true,
    scale: "apparel",
    description:
      "The earth colourway of the panelled work shirt. Brown camo against grey raw denim, unwashed selvedge.",
  },
  {
    slug: "green-camo-brown-raw-denim-jorts",
    title: "GREEN CAMO // BROWN RAW DENIM JORTS",
    price: 4699,
    estimated: false,
    scale: "apparel",
    description:
      "Knee-length jorts cut from spliced green camo and brown raw denim. Raw hem, left to fray with wear.",
  },
  {
    slug: "brown-camo-grey-raw-denim-jorts",
    title: "BROWN CAMO // GREY RAW DENIM JORTS",
    price: 4699,
    estimated: false,
    scale: "apparel",
    description:
      "Knee-length jorts in brown camo spliced with grey raw denim. Deep pockets, raw hem, heavy hand.",
  },
  {
    slug: "dark-blue-camo-blue-raw-denim-top",
    title: "DARK BLUE CAMO // BLUE RAW DENIM TOP",
    price: 3999,
    estimated: false,
    scale: "apparel",
    description:
      "Cropped structured top halved between dark blue camo and blue raw denim. Exposed seams throughout.",
  },
  {
    slug: "brown-camo-brown-raw-denim-top",
    title: "BROWN CAMO // BROWN RAW DENIM TOP",
    price: 3999,
    estimated: false,
    scale: "apparel",
    description:
      "Cropped structured top in tonal brown camo and brown raw denim. Exposed seams, unfinished edges.",
  },
  {
    slug: "dark-blue-camo-blue-raw-denim-skirt",
    title: "DARK BLUE CAMO // BLUE RAW DENIM SKIRT",
    price: 2799,
    estimated: false,
    scale: "apparel",
    description:
      "Panelled mini skirt in dark blue camo and blue raw denim. Flat-felled seams, zero stretch.",
  },
  {
    slug: "brown-camo-brown-raw-denim-skirt",
    title: "BROWN CAMO // BROWN RAW DENIM SKIRT",
    price: 2799,
    estimated: false,
    scale: "apparel",
    description:
      "Panelled mini skirt in brown camo and brown raw denim. Flat-felled seams, rigid until broken in.",
  },
  {
    slug: "structure-01-tee-white",
    title: "STRUCTURE-01 TEE / WHITE",
    price: 2199,
    estimated: true,
    scale: "apparel",
    description:
      "240gsm carded cotton, boxy body, ribbed collar. STRUCTURE-01 graphic printed heavy on the back.",
  },
  {
    slug: "structure-01-tee-black",
    title: "STRUCTURE-01 TEE / BLACK",
    price: 2199,
    estimated: true,
    scale: "apparel",
    description:
      "240gsm carded cotton in black, boxy body, ribbed collar. STRUCTURE-01 graphic printed heavy on the back.",
  },
];

export const products: Product[] = SEED.map((seed, i) => ({
  ...seed,
  id: String(i + 1).padStart(3, "0"),
  sizes: seed.sizes ?? SIZES_BY_SCALE[seed.scale],
  defaultSize: DEFAULT_SIZE_BY_SCALE[seed.scale],
  images: {
    primary: `/products/${seed.slug}-1.jpg`,
    alternate: `/products/${seed.slug}-2.jpg`,
  },
}));

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

/** ₹4,499 — grouped to the Indian numbering system. */
export function formatPrice(paiseFreeInr: number): string {
  return `₹${paiseFreeInr.toLocaleString("en-IN")}`;
}
