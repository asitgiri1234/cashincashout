import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Shipping Policy" };

export default function Page() {
  return (
    <PolicyPage
      title="SHIPPING POLICY"
      sections={[
    { heading: "DISPATCH", body: "Placeholder: orders dispatch within 3 business days from India." },
    { heading: "RATES", body: "Placeholder: shipping calculated at checkout by weight and destination." },
    { heading: "DUTIES", body: "Placeholder: international duties are the buyer's responsibility." },
      ]}
    />
  );
}
