export const RazorpayMobileService = {
  checkout: async ({ amount, orderId, name, email, phone }) => {
    // Razorpay checkout options object
    return {
      description: 'CabTaxi Ride Top-up',
      image: 'https://i.imgur.com/3g7nmjc.png',
      currency: 'INR',
      key: 'rzp_test_mockkey',
      amount: amount * 100,
      name: 'CabTaxi',
      order_id: orderId,
      prefill: { email, contact: phone, name },
      theme: { color: '#7C3AED' }
    }
  }
}
