let n = 0;
function tick(dt: number) { n += dt; }
function view() {
  return <div className="stage"><div className="box" onClick={() => rg.sound("pop")}>Hello {Math.floor(n * 10) / 10}</div></div>;
}
