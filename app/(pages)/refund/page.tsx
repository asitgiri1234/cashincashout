import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Refund Policy" };

export default function Page() {
  return (
    <PolicyPage
      title="REFUND POLICY"
      sections={[
    { heading: "RETURNS", body: "Placeholder: unworn items in original condition within 14 days of delivery." },
    { heading: "EXCHANGES", body: "Placeholder: size exchanges subject to stock." },
    { heading: "EXCLUSIONS", body: "Placeholder: the raw tire belt is cut to order and final sale." },
      ]}
    />
  );
}
