import logo1 from "@assets/Sideline_Customer_Logos_-_1_1772325538622.png";
import logo2 from "@assets/Sideline_Customer_Logos_-_2_1772325538621.png";
import logo3 from "@assets/Sideline_Customer_Logos_-_3_1772325538621.png";
import logo4 from "@assets/Sideline_Customer_Logos_-_4_1772325538621.png";
import logo5 from "@assets/Sideline_Customer_Logos_-_5_1772325538621.png";
import logo6 from "@assets/Sideline_Customer_Logos_-_6_1772325538621.png";
import logo7 from "@assets/Sideline_Customer_Logos_-_7_1772325538621.png";
import logo8 from "@assets/Sideline_Customer_Logos_-_8_1772325538621.png";
import logo9 from "@assets/Sideline_Customer_Logos_-_9_1772325538621.png";
import logo10 from "@assets/Sideline_Customer_Logos_-_10_1772325538621.png";
import logo11 from "@assets/Sideline_Customer_Logos_-_11_1772325538621.png";
import logo12 from "@assets/Sideline_Customer_Logos_-_12_1772325538621.png";
import logo13 from "@assets/Sideline_Customer_Logos_-_13_1772325538621.png";
import logo14 from "@assets/Sideline_Customer_Logos_-_14_1772325538621.png";
import logo15 from "@assets/Sideline_Customer_Logos_-_15_1772325538621.png";
import logo16 from "@assets/Sideline_Customer_Logos_-_16_1772325538621.png";
import logo17 from "@assets/Sideline_Customer_Logos_-_17_1772327060504.png";
import logo18 from "@assets/Sideline_Customer_Logos_-_18_1772327060504.png";
import logo19 from "@assets/Sideline_Customer_Logos_-_19_1772327060504.png";
import logo20 from "@assets/Sideline_Customer_Logos_-_20_1772327060504.png";
import logo21 from "@assets/Sideline_Customer_Logos_-_21_1772327060504.png";
import logo22 from "@assets/Sideline_Customer_Logos_-_22_1772327060504.png";
import logo23 from "@assets/Sideline_Customer_Logos_-_23_1772327911374.png";
import logo24 from "@assets/Sideline_Customer_Logos_-_24_1772327911374.png";
import logo25 from "@assets/Sideline_Customer_Logos_-_25_1772327911374.png";
import logo26 from "@assets/Sideline_Customer_Logos_-_26_1772329882895.png";
import logo27 from "@assets/Sideline_Customer_Logos_-_27_1772329882895.png";

const logos = [
  logo1, logo2, logo3, logo4, logo5, logo6, logo7, logo8, logo9,
  logo10, logo11, logo12, logo13, logo14, logo15, logo16, logo17,
  logo18, logo19, logo20, logo21, logo22, logo23, logo24, logo25,
  logo26, logo27,
];

export function CustomerLogos() {
  return (
    <section style={{ background: "#fff", padding: "64px 0" }}>
      <p style={{
        fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase",
        color: "rgba(0,0,0,0.35)", marginBottom: "32px", textAlign: "center",
      }}>
        Trusted by clubs & schools worldwide
      </p>
      <div style={{ overflow: "hidden", position: "relative" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: "80px", zIndex: 2,
          background: "linear-gradient(to right, #fff, transparent)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: "80px", zIndex: 2,
          background: "linear-gradient(to left, #fff, transparent)", pointerEvents: "none",
        }} />
        <div style={{
          display: "flex", gap: "48px", width: "max-content",
          animation: "logoScroll 40s linear infinite",
        }}>
          {[...logos, ...logos].map((src, i) => (
            <img
              key={i}
              src={src}
              alt="Customer logo"
              style={{
                height: "52px", width: "auto", objectFit: "contain",
                opacity: 1,
              }}
            />
          ))}
        </div>
        <style>{`@keyframes logoScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
      </div>
    </section>
  );
}
