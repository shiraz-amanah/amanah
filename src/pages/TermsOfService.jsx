import PolicyLayout, { H1, H2, H3, P, UL, HR, A } from "./policyUI";

// Terms of Service (static legal page). Route: /terms.
const TermsOfService = ({ header }) => (
  <PolicyLayout header={header}>
    <H1>Terms of Service</H1>
    <P><strong>Saveco Tech Ltd ("Amanah")</strong><br />Last updated: 8 July 2026</P>
    <P>These Terms of Service govern your use of the Amanah platform (youramanah.co.uk), operated by Saveco Tech Ltd (Company No. 12720369), registered in England and Wales.</P>
    <P>By creating an account or using the Amanah platform, you agree to these terms.</P>

    <HR />
    <H2>1. Who These Terms Apply To</H2>
    <P>These terms apply to:</P>
    <UL>
      <li><strong>Mosque and madrasah administrators</strong> who use Amanah to manage classes, students, payments and communications</li>
      <li><strong>Scholars and teachers</strong> who use Amanah to deliver lessons</li>
      <li><strong>Parents and guardians</strong> who use Amanah to manage their children's education and pay fees</li>
    </UL>

    <HR />
    <H2>2. The Service</H2>
    <P>Amanah provides:</P>
    <UL>
      <li>Class management, student enrolment, and attendance tracking</li>
      <li>Qur'an and Hifz memorisation progress tracking</li>
      <li>Live video lessons via Daily.co</li>
      <li>Parent communication and notifications</li>
      <li>Subscription and one-off fee payment processing via Stripe</li>
      <li>AI-assisted administrative tools</li>
    </UL>
    <P>We do not guarantee uninterrupted availability but target 99.9% uptime. We will provide reasonable notice of planned maintenance.</P>

    <HR />
    <H2>3. Accounts</H2>
    <P>You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials. You must notify us immediately at support@youramanah.co.uk if you suspect unauthorised access to your account.</P>

    <HR />
    <H2>4. Acceptable Use</H2>
    <P>You must not:</P>
    <UL>
      <li>Use the platform for any unlawful purpose</li>
      <li>Upload harmful, offensive, or inappropriate content</li>
      <li>Attempt to access other users' data</li>
      <li>Reverse engineer or attempt to extract the platform's source code</li>
      <li>Use the platform to harass, harm, or discriminate against any person</li>
      <li>Process children's data in ways not permitted by these terms or applicable law</li>
    </UL>

    <HR />
    <H2>5. Payments and Subscriptions</H2>

    <H3>5a. Platform Fees</H3>
    <P>Amanah charges a 2.5% platform fee on all payments processed through the platform. This is deducted automatically at the point of payment.</P>

    <H3>5b. Mosque Subscription Fees (Parent-facing)</H3>
    <P>Where a mosque sets a subscription fee for a class:</P>
    <UL>
      <li>Parents are charged the fee set by the mosque</li>
      <li>Subscriptions auto-renew monthly or termly unless cancelled</li>
      <li>Parents will receive a reminder before any free trial converts to a paid subscription</li>
      <li>Parents can cancel their subscription at any time from their Fees tab; cancellation takes effect at the end of the current billing period</li>
    </UL>

    <H3>5c. 14-Day Cooling-Off Right</H3>
    <P>Under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013, you have the right to cancel a new subscription within 14 days of sign-up without giving any reason. To exercise this right, contact us at support@youramanah.co.uk within 14 days of subscribing.</P>

    <H3>5d. Failed Payments</H3>
    <P>If a payment fails, we will notify you and retry the payment in line with our dunning schedule. After repeated failures, the mosque administrator will be notified. We will not automatically remove a child from a class without the mosque administrator's review.</P>

    <H3>5e. Refunds</H3>
    <P>Refunds are handled on a case-by-case basis. Where you are entitled to a refund under the Consumer Rights Act 2015 or the Consumer Contracts Regulations 2013, we will process it promptly. Contact support@youramanah.co.uk.</P>

    <H3>5f. Stripe</H3>
    <P>Payment processing is provided by Stripe. By making a payment through Amanah, you also agree to <A href="https://stripe.com/gb/legal">Stripe's Terms of Service</A>.</P>

    <HR />
    <H2>6. Children's Data and Safeguarding</H2>
    <P>Amanah is used to manage children's educational records. Mosque administrators are responsible for:</P>
    <UL>
      <li>Obtaining appropriate consents from parents before enrolling children</li>
      <li>Using the platform in compliance with applicable safeguarding and data protection law</li>
      <li>Not uploading inappropriate or harmful content relating to children</li>
    </UL>

    <HR />
    <H2>7. Intellectual Property</H2>
    <P>All content, software, and technology on the Amanah platform is owned by Saveco Tech Ltd or its licensors. You may not copy, distribute, or create derivative works without our written permission.</P>
    <P>Your content (class materials, photos uploaded by mosques, messages) remains yours. You grant us a licence to store and display it solely for the purpose of providing the service.</P>

    <HR />
    <H2>8. Limitation of Liability</H2>
    <P>To the maximum extent permitted by law:</P>
    <UL>
      <li>We are not liable for indirect, consequential, or incidental losses</li>
      <li>Our total liability to you shall not exceed the amount you paid us in the 12 months preceding the claim</li>
      <li>Nothing in these terms limits liability for death or personal injury caused by our negligence, fraud, or any liability that cannot be excluded by law</li>
    </UL>

    <HR />
    <H2>9. Service Changes and Termination</H2>
    <P>We may update or change the platform with reasonable notice. We may suspend or terminate accounts that breach these terms. You may close your account at any time by contacting support@youramanah.co.uk.</P>

    <HR />
    <H2>10. Governing Law</H2>
    <P>These terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.</P>

    <HR />
    <H2>11. Changes to These Terms</H2>
    <P>We will notify you of material changes by email at least 14 days before they take effect. Continued use of the platform after that date constitutes acceptance of the new terms.</P>

    <HR />
    <H2>12. Contact</H2>
    <P><strong>Saveco Tech Ltd (Amanah)</strong><br />Trust House C/O Isaacs, St James Business Park,<br />5 New Augustus Street, Bradford, West Yorkshire, BD1 5LL<br />Email: support@youramanah.co.uk</P>
  </PolicyLayout>
);

export default TermsOfService;
