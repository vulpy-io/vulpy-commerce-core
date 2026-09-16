

const SearchForm = () => {
  return (
    <div className="rounded-xl bg-white shadow-1">
      <div className="border-gray-3 border-b px-4 py-4.5 sm:px-6">
        <h2 className="font-semibold text-content-primary text-lg">Search</h2>
      </div>

      <div className="p-4 sm:p-6">
        <form>
          <div className="relative">
            <input
              className="w-full rounded-md border border-gray-3 py-3 pr-13 pl-5 outline-none duration-200 ease-out placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
              placeholder="Search here..."
              type="text"
            />
            <button className="absolute top-0 right-0 px-4 py-3.5 text-content-secondary duration-200 ease-out hover:text-content-brand">
              <svg
                className="fill-current"
                fill="none"
                height="20"
                viewBox="0 0 20 20"
                width="20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g clipPath="url(#clip0_112_7367)">
                  <path
                    clipRule="evenodd"
                    d="M9.58464 2.29163C5.55756 2.29163 2.29297 5.55622 2.29297 9.58329C2.29297 13.6104 5.55756 16.875 9.58464 16.875C13.6117 16.875 16.8763 13.6104 16.8763 9.58329C16.8763 5.55622 13.6117 2.29163 9.58464 2.29163ZM1.04297 9.58329C1.04297 4.86586 4.8672 1.04163 9.58464 1.04163C14.3021 1.04163 18.1263 4.86586 18.1263 9.58329C18.1263 11.7171 17.3439 13.6681 16.0504 15.1651L18.7766 17.8914C19.0207 18.1354 19.0207 18.5312 18.7766 18.7752C18.5325 19.0193 18.1368 19.0193 17.8927 18.7752L15.1665 16.049C13.6694 17.3426 11.7184 18.125 9.58464 18.125C4.8672 18.125 1.04297 14.3007 1.04297 9.58329Z"
                    fill=""
                    fillRule="evenodd"
                    stroke=""
                    stroke-linecap="round"
                  />
                </g>
                <defs>
                  <clipPath id="clip0_112_7367">
                    <rect fill="white" height="20" width="20" />
                  </clipPath>
                </defs>
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SearchForm;
