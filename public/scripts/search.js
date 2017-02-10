function search() {
  console.log($("#search").val() + " " + $("#pharmacies").val());
  $.post("/search", {
    medicine: $("#search").val(),
    pharmacy: $("#pharmacies").val()
  }, function(data, status){ });
}
