$( document ).ready(function() {
    console.log( "ready!" );
    $("#showable").hide();
});

// data = {"name": "Panadol", "Price": 32, "Amount": "not"};

function search() {
  console.log($("#search").val() + " " + $("#pharmacies").val());
  $.post("/search", {
    medicine: $("#search").val(),
    pharmacy: $("#pharmacies").val()
  }, function(data, status){
    $("#hideable_banner").hide();
    $("#hideable").hide();
    $("#showable").show();
    if (data.Amount == "Available"){
      $("#med_list").html(`
        <tr>
          <td>` + data.name + `</td>
          <td><span class='badge'>` + data.Price + `</span></td>
          <td>Avaiblable</td>
          <td><button>Add To Cart</button></td>
        </tr>
      `);
    } else {
      $("#med_list").html(`
        <tr>
          <td colspan="4">Not Available</td>
        </tr>
      `);
    }
  });


}
