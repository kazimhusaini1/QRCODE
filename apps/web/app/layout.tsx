import './styles.css';
import FoodNav from '../components/food-nav';

export const metadata = { title: 'Mahalla — Good things, closer', description: 'Discover local shops, food and services around your society.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<FoodNav /></body></html>;
}
