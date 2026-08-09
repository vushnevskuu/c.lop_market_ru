import { memo, useRef, useCallback, useEffect, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMainScroll } from "@/contexts/MainScrollContext";
import { useProducts } from "@/hooks/useProducts";
import Header from "@/components/Header";
import ProductGrid from "@/components/ProductGrid";
import ProductModal from "@/components/ProductModal";
import GeoHomeJsonLd from "@/components/GeoHomeJsonLd";
import Footer from "@/components/Footer";
import ShoeCanvas from "@/components/ShoeCanvas";
import { cn } from "@/lib/utils";

const Index = memo(() => {
  const createShoeRef = useRef<(() => void) | null>(null);
  const { scrollContainerRef, useScrollContainer } = useMainScroll();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { products, loading, error } = useProducts();
  const isMobile = useIsMobile();

  const itemRaw = searchParams.get("item");

  const selectedProduct = useMemo(() => {
    if (!itemRaw || !products.length) return null;
    const dec = decodeURIComponent(itemRaw);
    return (
      products.find(
        (p) => String(p.id) === dec || p.id === itemRaw || String(p.id) === itemRaw || p.id === dec
      ) ?? null
    );
  }, [itemRaw, products]);

  const modalOpen = Boolean(itemRaw);

  const handleOpenProduct = useCallback(
    (id: string | number) => {
      setSearchParams({ item: String(id) }, { replace: false });
    },
    [setSearchParams]
  );

  const handleModalOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("item");
            return next;
          },
          { replace: true }
        );
      }
    },
    [setSearchParams]
  );

  const handleShoeCreate = useCallback((createFn: () => void) => {
    createShoeRef.current = createFn;
  }, []);

  const handleFooterShoeCreate = useCallback((setCreateFn: (fn: () => void) => void) => {
    if (createShoeRef.current) {
      setCreateFn(createShoeRef.current);
    }
  }, []);

  // Обработка якоря #shop при переходе с других страниц
  useEffect(() => {
    if (location.hash === '#shop') {
      setTimeout(() => {
        const shopEl = document.getElementById('shop');
        const container = scrollContainerRef?.current;
        if (shopEl && useScrollContainer && container) {
          const top = shopEl.getBoundingClientRect().top + container.scrollTop;
          container.scrollTo({ top: top - 24, behavior: 'smooth' });
        } else if (shopEl) {
          shopEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [location.hash, useScrollContainer]);

  const pageBody = (
    <>
      <GeoHomeJsonLd />
      <main className="m-0 flex-1 p-0 pt-[120px] pb-16 md:pb-20 md:pt-[132px]">
        <ProductGrid
          products={products}
          loading={loading}
          error={error}
          onProductOpen={handleOpenProduct}
        />
      </main>
      {!isMobile && <ShoeCanvas onShoeCreate={handleShoeCreate} />}
      {!isMobile && <Footer onShoeCreate={handleFooterShoeCreate} />}
    </>
  );

  return (
    <div
      className="flex min-h-0 flex-col bg-background"
      style={{ margin: 0, padding: 0, minHeight: "100dvh" }}
    >
      <ProductModal
        open={modalOpen}
        loading={loading}
        product={selectedProduct}
        onOpenChange={handleModalOpenChange}
      />
      <Header />
      {useScrollContainer ? (
        <div
          ref={scrollContainerRef}
          className={cn(
            "flex min-h-0 w-full flex-1 flex-col overflow-x-hidden",
            modalOpen ? "overflow-hidden" : "overflow-y-auto"
          )}
          style={{
            height: "100dvh",
            maxHeight: "100dvh",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* min-h-full: при малом контенте футер остаётся внизу окна */}
          <div className="flex min-h-full flex-col">{pageBody}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-[100dvh] flex-col">{pageBody}</div>
        </div>
      )}
    </div>
  );
});

Index.displayName = 'Index';

export default Index;
