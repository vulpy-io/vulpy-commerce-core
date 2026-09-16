import { useState } from "react";

const Login = () => {
  const [dropdown, setDropdown] = useState(false);

  return (
    <div className="rounded-panel bg-white shadow-1">
      <div
        className={`flex cursor-pointer items-center gap-0.5 px-5.5 py-5 ${
          dropdown && "border-gray-3 border-b"
        }`}
        onClick={() => setDropdown(!dropdown)}
      >
        Already have an account?
        <span className="flex items-center gap-2.5 pl-1 font-semibold text-content-primary">
          Click to sign in
          <svg
            className={`${
              dropdown && "rotate-180"
            } fill-current duration-200 ease-out`}
            fill="none"
            height="22"
            viewBox="0 0 22 22"
            width="22"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              clipRule="evenodd"
              d="M4.06103 7.80259C4.30813 7.51431 4.74215 7.48092 5.03044 7.72802L10.9997 12.8445L16.9689 7.72802C17.2572 7.48092 17.6912 7.51431 17.9383 7.80259C18.1854 8.09088 18.1521 8.5249 17.8638 8.772L11.4471 14.272C11.1896 14.4927 10.8097 14.4927 10.5523 14.272L4.1356 8.772C3.84731 8.5249 3.81393 8.09088 4.06103 7.80259Z"
              fill=""
              fillRule="evenodd"
            />
          </svg>
        </span>
      </div>

      <div
        className={`${
          dropdown ? "block" : "hidden"
        } px-4 pt-7.5 pb-8.5 sm:px-8.5`}
      >
        <p className="mb-6 text-custom-sm">
          If you are not signed in, please log in to your account first.
        </p>

        <div className="mb-5">
          <label className="mb-2.5 block" htmlFor="name">
            Email
          </label>

          <input
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
            id="name"
            name="name"
            type="text"
          />
        </div>

        <div className="mb-5">
          <label className="mb-2.5 block" htmlFor="password">
            Password
          </label>

          <input
            autoComplete="on"
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
            id="password"
            name="password"
            type="password"
          />
        </div>

        <button
          className="inline-flex rounded-md bg-action-primary-background px-10.5 py-3 font-semibold text-white duration-200 ease-out hover:bg-action-primary-hover"
          type="submit"
        >
          Sign in
        </button>
      </div>
    </div>
  );
};

export default Login;
