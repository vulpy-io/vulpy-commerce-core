

const Categories = ({ categories }) => {
  return (
    <div className="mt-7.5 rounded-xl bg-white shadow-1">
      <div className="border-gray-3 border-b px-4 py-4.5 sm:px-6">
        <h2 className="font-semibold text-content-primary text-lg">Popular categories</h2>
      </div>

      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-3">
          <button className="group flex items-center justify-between text-content-primary duration-200 ease-out hover:text-content-brand">
            Desktop computers
            <span className="inline-flex rounded-badge bg-gray-2 px-1.5 text-custom-xs duration-200 ease-out group-hover:bg-action-primary-background group-hover:text-white">
              12
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Categories;
