import PolicyLayout, { H1, H2, P, HR, Table } from "./policyUI";

// Cookie Policy (static legal page). Route: /cookies.
const CookiePolicy = ({ header }) => (
  <PolicyLayout header={header}>
    <H1>Cookie Policy</H1>
    <P><strong>Saveco Tech Ltd ("Amanah")</strong><br />Last updated: 8 July 2026</P>

    <HR />
    <H2>What Are Cookies</H2>
    <P>Cookies are small text files stored on your device when you visit a website. We use a small number of cookies that are strictly necessary for the platform to function.</P>

    <HR />
    <H2>Cookies We Use</H2>
    <Table
      head={["Cookie", "Purpose", "Duration"]}
      rows={[
        ["Session cookie (Supabase)", "Keeps you logged in", "Session (cleared when you close browser)"],
        ["Sentry session", "Error monitoring and debugging", "7 days"],
        ["Stripe cookies", "Payment fraud prevention", "Session"],
      ]}
    />
    <P>We do not use advertising cookies, tracking pixels, or third-party analytics cookies.</P>

    <HR />
    <H2>Your Choices</H2>
    <P>The cookies we use are strictly necessary for the platform to function. You can disable cookies in your browser settings but this will prevent you from logging in or using the platform.</P>

    <HR />
    <H2>Changes</H2>
    <P>We will update this policy if we add new cookies. Check this page for the current version.</P>

    <HR />
    <H2>Contact</H2>
    <P>privacy@youramanah.co.uk</P>
  </PolicyLayout>
);

export default CookiePolicy;
