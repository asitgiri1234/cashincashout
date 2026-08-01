import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Contact" };

export default function Page() {
  return (
    <PolicyPage
      title="CONTACT"
      sections={[
    { heading: "EMAIL", body: "Placeholder: hello@cashincashout.example — replace with the real address." },
    { heading: "SOCIAL", body: "Placeholder: @cashincashout everywhere, eventually." },
    { heading: "PRESS", body: "Placeholder: press kit on request." },
      ]}
    />
  );
}
