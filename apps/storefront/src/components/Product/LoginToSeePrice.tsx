// Core stub (R1f) — Pro login-to-see-price gate excluded from the public Core
// tree. Core never gates prices, so the component renders null. Same props as
// the Pro component it replaces.
const LoginToSeePrice = (_props: {
  className?: string;
  label?: string;
}): null => null;

export default LoginToSeePrice;
