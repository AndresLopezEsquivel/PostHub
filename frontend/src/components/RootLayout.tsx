import { Outlet } from 'react-router';

import { NavBar } from './NavBar';

// The shell every screen renders inside. Nothing but the nav and the outlet:
// docs/screens.md calls the navigation bar a "surface every screen depends on",
// and a layout route is how that dependency is expressed once rather than
// imported by twelve pages.
export function RootLayout() {
  return (
    <>
      <NavBar />
      <main>
        <Outlet />
      </main>
    </>
  );
}
