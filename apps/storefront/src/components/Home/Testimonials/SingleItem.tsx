import Image from "next/image";
import type { CmsTestimonial } from "@/lib/cms/types";

const SingleItem = ({ testimonial }: { testimonial: CmsTestimonial }) => {
  return (
    <div className="m-1 rounded-panel bg-surface px-4 py-7.5 shadow-testimonial sm:px-8.5">
      <p className="mb-6 text-content-primary">{testimonial.quote}</p>
      <div className="flex items-center gap-4">
        {testimonial.avatarUrl && (
          <Image
            alt={testimonial.authorName}
            className="h-12.5 w-12.5 overflow-hidden rounded-full"
            height={50}
            src={testimonial.avatarUrl}
            width={50}
          />
        )}
        <div>
          <h3 className="font-semibold text-content-primary">{testimonial.authorName}</h3>
          <p className="text-content-muted text-custom-sm">{testimonial.authorRole}</p>
        </div>
      </div>
    </div>
  );
};

export default SingleItem;
