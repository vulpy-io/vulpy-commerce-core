import { useEffect, useState } from "react";

type SelectOption = {
  label: string;
  value: string;
};

const CustomSelect = ({
  className,
  onChange,
  options,
  value,
  variant = "default",
}: {
  className?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  value?: string;
  variant?: "default" | "dark";
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState(
    options.find((option) => option.value === value) ?? options[0]
  );

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const handleOptionClick = (option: SelectOption) => {
    setSelectedOption(option);
    onChange?.(option.value);
    toggleDropdown();
  };

  useEffect(() => {
    setSelectedOption(
      options.find((option) => option.value === value) ?? options[0]
    );
  }, [options, value]);

  useEffect(() => {
    // closing modal while clicking outside
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".dropdown-content")) {
        toggleDropdown();
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, toggleDropdown]);

  return (
    <div
      className={`dropdown-content custom-select relative ${variant === "dark" ? "custom-select-dark" : ""} ${className ?? "w-[200px]"}`}
    >
      <div
        className={`select-selected flex h-full items-center whitespace-nowrap ${
          isOpen ? "select-arrow-active" : ""
        }`}
        onClick={toggleDropdown}
      >
        {selectedOption?.label ?? "All categories"}
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
