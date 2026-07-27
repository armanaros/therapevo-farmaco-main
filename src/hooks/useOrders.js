import { useState, useEffect, useRef } from 'react';
import { subscribeToOrders } from '@/services/order.service';
import { getManilaDayRange } from '@/utils/dateHelpers';
import { useRestaurant } from '@/hooks/useRestaurant';
import { playNotificationSound } from '@/utils/notificationSound';

const useOrders = (daysBack = 30) => {
  const { restaurantId } = useRestaurant();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const prevOrderCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    console.log('[useOrders] Subscribing with restaurantId:', restaurantId || '(empty)', 'daysBack:', daysBack);
    setLoading(true);
    isInitialLoadRef.current = true;
    const unsubscribe = subscribeToOrders(restaurantId || '', (data) => {
      console.log('[useOrders] Received orders:', data.length);
      
      if (!isInitialLoadRef.current && data.length > prevOrderCountRef.current) {
        playNotificationSound();
      }
      
      prevOrderCountRef.current = data.length;
      isInitialLoadRef.current = false;
      setOrders(data);
      setLoading(false);
    }, daysBack);
    return () => unsubscribe();
  }, [restaurantId, daysBack]);

  const todaysOrders = orders.filter((o) => {
    const ref = o.createdAt?.toDate?.();
    if (!ref) return true;
    const { start, end } = getManilaDayRange();
    return ref >= start && ref <= end;
  });

  return { orders, loading, todaysOrders };
};

export default useOrders;
