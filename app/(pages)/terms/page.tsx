import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Terms Of Service" };

export default function Page() {
  return (
    <PolicyPage
      title="TERMS OF SERVICE"
      sections={[
    { heading: "THE BASICS", body: "Placeholder: by using this demo storefront you agree to nothing at all, because nothing here is for sale." },
    { heading: "INTELLECTUAL PROPERTY", body: "Placeholder: the CICO wordmark and product imagery belong to CASH IN CASH OUT." },
    { heading: "CHANGES", body: "Placeholder: these terms may change when the real store launches." },
      ]}
    />
  );
}
