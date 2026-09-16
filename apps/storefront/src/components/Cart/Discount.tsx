const Discount = () => {
  return (
    <div className="w-full lg:max-w-[670px]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        {/* <!-- coupon box --> */}
        <div className="rounded-panel bg-white shadow-1">
          <div className="border-gray-3 border-b px-4 py-5 sm:px-5.5">
            <h3 className="">Have a promo code?</h3>
          </div>

          <div className="px-4 py-8 sm:px-8.5">
            <div className="flex flex-wrap gap-4 xl:gap-5.5">
              <div className="w-full max-w-[426px]">
                <input
                  className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
                  id="coupon"
                  name="coupon"
                  placeholder="Enter promo code"
                  type="text"
                />
              </div>

              <button
                className="inline-flex rounded-md bg-action-primary-background px-8 py-3 font-semibold text-white duration-200 ease-out hover:bg-action-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                disabled
                type="submit"
              >
                Promotions coming soon
              </button>
            </div>
            <p className="mt-3 text-content-muted text-custom-sm">
              Discount codes will be available once Medusa promotions are
              enabled.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
};

export default Discount;
