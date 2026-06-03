import { animate, stagger } from "animejs"

export function fadeInUp(targets: string | Element | Element[], delay = 0) {
  animate(targets, {
    opacity: [0, 1],
    translateY: [16, 0],
    duration: 400,
    delay,
    easing: "easeOutCubic",
  })
}

export function staggerFadeIn(targets: string | Element | Element[]) {
  animate(targets, {
    opacity: [0, 1],
    translateY: [12, 0],
    duration: 350,
    delay: stagger(60),
    easing: "easeOutCubic",
  })
}

export function slideInLeft(targets: string | Element | Element[]) {
  animate(targets, {
    opacity: [0, 1],
    translateX: [-20, 0],
    duration: 350,
    easing: "easeOutCubic",
  })
}
