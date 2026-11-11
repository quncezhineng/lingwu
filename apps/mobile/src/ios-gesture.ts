/** 松手时：拖过半屏，或沿打开方向的速度够快，就完成这次返回/关闭。 */
export function shouldCompletePop(distance: number, width: number, velocity: number): boolean {
  if (distance <= 0 || width <= 0) return false;
  return distance > width * 0.5 || velocity > 0.7;
}
