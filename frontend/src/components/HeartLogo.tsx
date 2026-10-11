export default function HeartLogo() {
  return (
    <svg
      className="brand-heart"
      width="35"
      height="39"
      viewBox="0 0 52 58"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cardio-heart-fill" x1="4" y1="7" x2="44" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E9A491" />
          <stop offset="1" stopColor="#A74B59" />
        </linearGradient>
      </defs>
      <g className="brand-heart-beat">
        <path
          d="M21 17C18 11 14 10 10 12C6 14 4 20 6 27C9 39 20 50 25 53C31 48 43 37 46 27C49 17 44 11 38 10C33 9 30 13 28 17L25 21L21 17Z"
          fill="url(#cardio-heart-fill)"
          stroke="#F4C1AE"
          strokeWidth="1.1"
        />
        <path d="M18 13L17 5C17 3 20 3 21 5L24 15M31 14L33 5C34 3 37 4 37 6L36 13" stroke="#E7A893" strokeWidth="4" strokeLinecap="round" />
        <path d="M12 31L19 31L22.4 24L26.5 38L30 30H40" stroke="#D7FFF3" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
