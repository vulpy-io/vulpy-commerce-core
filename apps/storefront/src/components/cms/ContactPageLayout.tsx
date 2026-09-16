import ContactFormBlock from "@/components/cms/ContactFormBlock";

export default function ContactPageLayout({
  contactAddress,
  contactEmail,
  contactName,
  contactPhone,
  formSubtitle,
  formTitle,
}: {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  formTitle?: string;
  formSubtitle?: string;
}) {
  return (
    <section className="container py-10">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-1">
          <h2 className="h2 mb-4">Contact information</h2>
          <div className="space-y-2 text-content-muted">
            {contactName ? (
              <p>
                <span className="font-medium text-content-primary">Name:</span> {contactName}
              </p>
            ) : null}
            {contactPhone ? (
              <p>
                <span className="font-medium text-content-primary">Phone:</span> {contactPhone}
              </p>
            ) : null}
            {contactEmail ? (
              <p>
                <span className="font-medium text-content-primary">Email:</span> {contactEmail}
              </p>
            ) : null}
            {contactAddress ? (
              <p>
                <span className="font-medium text-content-primary">Address:</span> {contactAddress}
              </p>
            ) : null}
          </div>
        </div>
        <ContactFormBlock embedded subtitle={formSubtitle} title={formTitle} />
      </div>
    </section>
  );
}
