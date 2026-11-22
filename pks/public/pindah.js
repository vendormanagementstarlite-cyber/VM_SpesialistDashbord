// Aplikasi Perjanjian terpisah sudah dipensiunkan: arahkan ke dashboard VM, pertahankan tautan perjanjian (#/perjanjian/ID).
(function () {
  var tujuan = 'https://vendormanagementstarlite-cyber.github.io/VM_SpesialistDashbord/';
  var h = location.hash.replace(/^#\/(pks\/)?/, '');
  var url = tujuan + (h ? '#/pks/' + h : '#/pks/overview');
  document.getElementById('ke').href = url;
  location.replace(url);
})();
