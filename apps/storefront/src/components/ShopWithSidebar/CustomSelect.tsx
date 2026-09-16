import { useEffect, useRef, useState } from "react";

type SelectOption = {
  label: string;
  value: string;
};

const CustomSelect = ({
  onChange,
  options,
  value,
}: {
  onChange?: (value: string) => void;
  options: SelectOption[];
  value?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState(
    options.find((option) => option.value === value) ?? options[0]
  );
  const selectRef = useRef<HTMLDivElement | null>(null);

  // Function to close the dropdown when a click occurs outside the component
  const handleClickOutside = (event: MouseEvent) => {
    if (
      selectRef.current &&
      event.target instanceof Node &&
      !selectRef.current.contains(event.target)
    ) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    // Add a click event listener to the document
    document.addEventListener("click", handleClickOutside);

    // Clean up the event listener when the component unmounts
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [handleClickOutside]);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    setSelectedOption(
      options.find((option) => option.value === value) ?? options[0]
    );
  }, [options, value]);

  const handleOptionClick = (option: SelectOption) => {
    setSelectedOption(option);
    onChange?.(option.value);
    toggleDropdown();
  };

  return (
    <div
      className="custom-select custom-select-2 relative shrink-0"
      ref={selectRef}
    >
      <div
        className={`select-selected whitespace-nowrap ${
          isOpen ? "select-arrow-active" : ""
        }`}
        onClick={toggleDropdown}
      >
        {selectedOption?.label ?? "Sort by"}
      </div>
      <div className={`select-items ${isOpen ? "" : "select-hide"}`}>
        {options.map((option) => (
          <div
            className={`select-item ${
              selectedOption?.value === option.value ? "same-as-selected" : ""
            }`}
            key={option.value}
            onClick={() => handleOptionClick(option)}
          >
            {option.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CustomSelect;
