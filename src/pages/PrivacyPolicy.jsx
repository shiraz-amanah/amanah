import PolicyLayout, { H1, H2, H3, P, UL, HR, A, Table } from "./policyUI";

// Privacy Policy (static legal page). Route: /privacy-policy. Content is authored
// verbatim from the approved copy; no data fetching.
const PrivacyPolicy = ({ header }) => (
  <PolicyLayout header={header}>
    <H1>Privacy Policy</H1>
    <P><strong>Saveco Tech Ltd ("Amanah", "we", "us", "our")</strong><br />Last updated: 8 July 2026</P>

    <H2>1. Who We Are</H2>
    <P>Amanah is operated by Saveco Tech Ltd, a company registered in England and Wales (Company No. 12720369), with its registered office at Trust House C/O Isaacs, St James Business Park, 5 New Augustus Street, Bradford, West Yorkshire, BD1 5LL.</P>
    <P>We are registered with the Information Commissioner's Office (ICO) under registration reference ZC190773.</P>
    <P>For data protection queries, contact us at: privacy@youramanah.co.uk</P>
    <P>We are the <strong>data controller</strong> for personal data processed through the Amanah platform. Where we process data on behalf of mosques and madrasahs (who act as data controllers for their own student and family records), we act as a <strong>data processor</strong> under a Data Processing Agreement.</P>

    <HR />
    <H2>2. What Data We Collect and Why</H2>

    <H3>2a. Mosque and Scholar Accounts</H3>
    <UL>
      <li>Full name, email address, organisation name, address</li>
      <li>Payment and banking information (via Stripe — we do not store card details)</li>
      <li>Stripe Connect account details for payment processing</li>
      <li><strong>Lawful basis:</strong> Contract (Article 6(1)(b) UK GDPR)</li>
    </UL>

    <H3>2b. Parent Accounts</H3>
    <UL>
      <li>Full name, email address</li>
      <li>Children's names, ages, class enrolments</li>
      <li>Attendance records, homework completion, progress reports, rewards and pastoral notes</li>
      <li>Payment records (subscription and one-off fees via Stripe)</li>
      <li>Photo consent decisions</li>
      <li><strong>Lawful basis:</strong> Contract (Article 6(1)(b) UK GDPR) and, where applicable, Legitimate Interests (Article 6(1)(f) UK GDPR)</li>
    </UL>

    <H3>2c. Children's Data (Special Category)</H3>
    <P>We process personal data relating to children enrolled in classes on the Amanah platform. This includes:</P>
    <UL>
      <li>Name, age, class and enrolment information</li>
      <li>Qur'an and Hifz memorisation progress</li>
      <li>Attendance, homework, rewards, and pastoral notes</li>
      <li>Class photographs (only where explicit consent is given)</li>
      <li>Voice and audio recordings (Hifz recitation homework, where this feature is enabled and consent has been given)</li>
    </UL>
    <P><strong>Children's data is processed under the lawful basis of Contract (Article 6(1)(b)) and, for voice/audio data, Explicit Consent (Article 6(1)(a) and Article 9(2)(a) UK GDPR).</strong> Parental or guardian consent is obtained before any child's voice or audio data is processed. Children under 13 cannot give consent for their own data — consent is always obtained from a parent or guardian.</P>
    <P>We comply with the ICO's Children's Code (Age Appropriate Design Code) and the Data (Use and Access) Act 2025.</P>

    <H3>2d. Usage and Technical Data</H3>
    <UL>
      <li>IP address, browser type, device information</li>
      <li>Usage logs, session data, error reports (via Sentry)</li>
      <li><strong>Lawful basis:</strong> Legitimate Interests (Article 6(1)(f) UK GDPR) — to maintain platform security and improve our service</li>
    </UL>

    <H3>2e. Payment Data</H3>
    <P>All payment processing is handled by Stripe, Inc. and Stripe Payments UK Ltd. We do not store card numbers or full payment details. We store transaction records (amounts, dates, status) for accounting and dispute resolution purposes.</P>
    <UL>
      <li><strong>Lawful basis:</strong> Contract and Legal Obligation (Article 6(1)(b) and (c) UK GDPR)</li>
    </UL>

    <HR />
    <H2>3. Special Category Data</H2>
    <P>Where we process religious beliefs (Islamic education context), health or disability information, or children's biometric/voice data, we treat this as special category data under Article 9 UK GDPR. We process it only:</P>
    <UL>
      <li>With explicit consent from the data subject or, for children, their parent or guardian</li>
      <li>Where necessary for the provision of our service under an appropriate safeguard</li>
    </UL>

    <HR />
    <H2>4. Who We Share Data With</H2>
    <P>We share data only with trusted third-party processors who are bound by Data Processing Agreements and comply with UK GDPR:</P>
    <Table
      head={["Processor", "Purpose", "Location"]}
      rows={[
        ["Supabase, Inc.", "Database hosting", "EU (eu-west-2)"],
        ["Vercel, Inc.", "Platform hosting", "EU/UK"],
        ["Stripe, Inc.", "Payment processing", "UK/EU/US (SCCs in place)"],
        ["Daily.co (Daily.co, Inc.)", "Live video lessons", "US (SCCs in place)"],
        ["Resend, Inc.", "Transactional email", "US (SCCs in place)"],
        ["Sentry (Functional Software, Inc.)", "Error monitoring", "US (SCCs in place)"],
        ["Anthropic, PBC", "AI features (admin summaries, matching)", "US (SCCs in place)"],
        ["OpenAI, LLC", "Voice transcription (Hifz homework)", "US (SCCs in place)"],
      ]}
    />
    <P>We do not sell personal data. We do not use personal data for advertising or marketing profiling.</P>

    <HR />
    <H2>5. International Data Transfers</H2>
    <P>Some of our processors are based outside the UK. Where data is transferred outside the UK, we ensure appropriate safeguards are in place, including:</P>
    <UL>
      <li>UK International Data Transfer Agreements (IDTAs) or Standard Contractual Clauses (SCCs)</li>
      <li>Adequacy decisions where applicable</li>
    </UL>

    <HR />
    <H2>6. How Long We Keep Data</H2>
    <Table
      head={["Data type", "Retention period"]}
      rows={[
        ["Account data", "For the duration of the account, plus 2 years after closure"],
        ["Payment records", "7 years (legal/tax obligation)"],
        ["Children's educational records", "Until the child's account is deleted by the mosque or parent, plus 1 year"],
        ["Voice/audio recordings", "90 days after creation, then permanently deleted unless retained with explicit consent"],
        ["Error logs (Sentry)", "90 days"],
        ["Usage logs", "12 months"],
      ]}
    />

    <HR />
    <H2>7. Your Rights Under UK GDPR</H2>
    <P>You have the right to:</P>
    <UL>
      <li><strong>Access</strong> your personal data (Subject Access Request)</li>
      <li><strong>Rectify</strong> inaccurate data</li>
      <li><strong>Erase</strong> your data ("right to be forgotten") — subject to legal retention obligations</li>
      <li><strong>Restrict</strong> processing in certain circumstances</li>
      <li><strong>Data portability</strong> — receive your data in a machine-readable format</li>
      <li><strong>Object</strong> to processing based on legitimate interests</li>
      <li><strong>Withdraw consent</strong> at any time (where consent is the lawful basis)</li>
    </UL>
    <P>To exercise any of these rights, contact us at privacy@youramanah.co.uk. We will respond within 30 days.</P>
    <P>If you are not satisfied with our response, you have the right to lodge a complaint with the ICO:</P>
    <UL>
      <li>Website: ico.org.uk</li>
      <li>Phone: 0303 123 1113</li>
      <li>Post: Information Commissioner's Office, Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF</li>
    </UL>

    <HR />
    <H2>8. Children's Privacy — Additional Safeguards</H2>
    <P>We take children's privacy extremely seriously and apply the highest standard of care:</P>
    <UL>
      <li>We do not profile children for commercial purposes</li>
      <li>We do not use children's data for advertising</li>
      <li>Default privacy settings are set to the most protective option</li>
      <li>We do not share children's data with third parties beyond those listed in Section 4</li>
      <li>Parental consent is required before class photographs are shared</li>
      <li>Parental consent is required before voice/audio data is processed</li>
      <li>Parents and guardians can request deletion of their child's data at any time</li>
    </UL>

    <HR />
    <H2>9. Security</H2>
    <P>We implement appropriate technical and organisational security measures including:</P>
    <UL>
      <li>Encrypted data storage and transmission (TLS/SSL)</li>
      <li>Row-level security on all database tables</li>
      <li>Role-based access controls</li>
      <li>Regular security monitoring via Sentry</li>
      <li>Data Processing Agreements with all third-party processors</li>
    </UL>

    <HR />
    <H2>10. Cookies</H2>
    <P>We use cookies to maintain your session and for error monitoring. See our <A href="/cookies">Cookie Policy</A> for details.</P>

    <HR />
    <H2>11. Changes to This Policy</H2>
    <P>We will notify registered users of material changes to this policy by email at least 14 days before changes take effect. The current version will always be available at youramanah.co.uk/privacy-policy.</P>

    <HR />
    <H2>12. Contact Us</H2>
    <P><strong>Saveco Tech Ltd (Amanah)</strong><br />Trust House C/O Isaacs<br />St James Business Park<br />5 New Augustus Street<br />Bradford, West Yorkshire, BD1 5LL</P>
    <P>Email: privacy@youramanah.co.uk</P>
  </PolicyLayout>
);

export default PrivacyPolicy;
