import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Privacy Policy" };

export default function Page() {
  return (
    <PolicyPage
      title="PRIVACY POLICY"
      sections={[
    { heading: "WHAT WE COLLECT", body: "Placeholder: this demo stores your cart, cookie choice and badge preference in your own browser via localStorage. Nothing is sent to a server." },
    { heading: "TRACKING", body: "Placeholder: no third-party ad tracking. Analytics, if added, will be disclosed here." },
    { heading: "CONTACT", body: "Placeholder: privacy questions go to the contact page." },
      ]}
    />
  );
}
