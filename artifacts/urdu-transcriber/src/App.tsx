import { Toaster } from '@/components/ui/toaster';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import Home from '@/pages/Home';

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="*" component={() => <div className="p-8 text-center text-muted-foreground">Page not found</div>} />
    </Switch>
  );
}

function App() {
  // Enforce dark mode on root element for this app
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add('dark');
  }

  return (
    <>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </>
  );
}

export default App;
