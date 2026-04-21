interface Props {
  size?: "sm" | "lg";
}

export function LogoMark({ size = "sm" }: Props) {
  return <div className={`dr-logo dr-logo--${size}`}>D</div>;
}
