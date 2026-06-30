<!DOCTYPE html>
<html>
<head>
        <title>BTO</title>
</head>
<style type="text/css">
        .under{
                text-decoration: underline;
        }
        .font{
                font-family:sans-serif;
                font-size: 14px;
        text-decoration: underline;
                color: black;
        margin-top:0px;
        }
        .bold{
                font-weight: bold;
        }
    .tbl{
        border: 1px solid black;
        width: 100%;
    }
    .tdr{
        border: 1px;
        border-color: black;
        border-right-style: solid;
    }
    .tdl{
        border: 1px;
        border-color: black;
        border-left-style: solid;
    }
    .tdl2{
        border: 1px;
        border-color: black;
        border-left-style: solid;
        border-top-style: solid;
        margin-top: 2px;
        /* text-align: center; */
    }
    .tdl3{
                border: none;
        /* text-align: center; */
    }
    .tbl2{
        border: 4px;
        width: 100%;
        /* padding: 10px; */
        border-style: solid;
    }
    .tbl3{
        width: 99%;
        /* padding: 11px; */
        margin:7px;
    }
    .tr{
        border: 2px;
        width: 100%;
        /* padding: 0; */
        border-style: solid;
        margin:2px;
    }
    .tr2{
        border:1px;
        border-style: solid;
        padding: 5px;
    }
    .tx-center{
        text-align:center;
    }
    .ft2{
        font-size: 11px;
        color: black;
                font-family:sans-serif;
        margin: 0;
    }
    .ft3{
        font-family:sans-serif;
                font-size: 13px;
        /* text-decoration: underline; */
                color: black;
        /* margin-top:20px; */
    }
    .border{
        border: 3px solid black;
        /* width:100%; */
    }
    br {
        display: block;
        margin: 2 0;
    }
</style>
<body>
        <!-- <div> -->
                <table class="tbl" cellspacing="0" cellpadding="0">
                        <tr>
                                <td class="tdr tx-center" width="13%">
                                        <img src="storage/upload/surat/inl.png" style="margin-top:25;" width="85">
                                </td>
                <td class="tx-center" width="">
                    <b class="font">PT. INDUSTRI NABATI LESTARI</b>
                    <p class="ft2"><b >PABRIK MINYAK GORENG</b></p>
                    <p class="ft2"><b> Kantor Pusat : Komp. KEK Sei Mangkei, Kav.2-3, Kec. Bosar Maligas,</b></p>
                    <p class="ft2"><b> Kab. Simalungun,</b></p>
                    <p class="ft2"><b> Sumatera Utara, 21184</b></p>
                </td>
                                <td class="tdl tx-center" style="position: absolute; top: 50%; font-size:11px;" width="18%">
                    <b>No. Dokumen</b>
                                        <p>INLHO/HRD-F/017</p>
                                        <!-- <p class="mt-1">{{$form->nomor_surat}}</p> -->
                </td>
                                <td class="tdl tx-center" style="position: absolute; top: 50%; font-size:11px;" width="15%">
                    <b>Tgl. Berlaku</b>
                                        <!-- <p class="mt-1">{{$form->nomor_surat}}</p> -->
                                        <p>12-Nov-18</p>
                </td>
                        </tr>
            <tr>
                                <td class="tdr">

                                </td>
                <td class="tx-center">

                    <b class="ft3">BUSINESS TRIP ORDER (BTO)</b>
                                        <!-- <p></p> -->
                </td>
                <td class="tdl2 tx-center" style="position: absolute; top: 50%; font-size:11px;">
                    <b>No. Revisi</b>
                    <p>00</p>
                </td>
                                <td class="tdl2 tx-center" style=" position: absolute; top: 50%; font-size:11px;">
                    <b>Halaman</b>
                    <p>1 dari 1</p>
                </td>
                        </tr>
                </table>
                <br>
                <?php
                        $bln = array(1=>'Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','Nopember','Desember');
                ?>
                <table class="tbl mt-1" style="">
                        <tr class="" style="font-size: 11px;">
                                <td width="8%"></td>
                                <td style="" width="20%">Nama Karyawan</td>
                                <td width="2%">: </td>
                                <td>{{$form->nama_pelaksana}}</td>
                                <td><div style="margin-bottom: 2em;"></div></td>
                        </tr>
                        @if($form->jabatan == 'Direktur Utama')
                        <tr class="" style="font-size: 11px;">
                                <td></td>
                                <td>Jabatan</td>
                                <td width="2%">: </td>
                                <td>Direktur</td>
                                <td><div style="margin-bottom: 2em;"></div></td>
                        </tr>
                        @elseif($form->jabatan == 'General Manager')
                        <tr class="" style="font-size: 11px;">
                                <td></td>
                                <td>Jabatan</td>
                                <td width="2%">: </td>
                                <td>{{$form->jabatan}} {{$form->divisi}}</td>
                                <td><div style="margin-bottom: 2em;"></div></td>
                        </tr>
                        @else
                        <tr class="" style="font-size: 11px;">
                                <td></td>
                                <td>Jabatan</td>
                                <td width="2%">: </td>
                                <td>{{$form->jabatan}}</td>
                                <td><div style="margin-bottom: 2em;"></div></td>
                        </tr>
                        @endif
                        <tr class="" style="font-size: 11px;">
                                <td></td>
                                <td>Departemen</td>
                                <td width="2%">: </td>
                                <td>{{$form->departemen}}</td>
                                <td><div style="margin-bottom: 2em;"></div></td>
                        </tr>
                </table>
                <br>
                <table class="tbl mt-1" style="">
                        <tr>
                                <td width="8%"></td>
                                <td style="" width="20%"></td>
                                <td width="2%"></td>
                                <td style="font-size: 14px;"><div style="margin-left: 8.5em; margin-bottom: 0.5em;"><b>DETAIL</b></div></td>
                                <td><div style="margin-bottom: 2em;"></div></td>
                        </tr>
                        <!-- <tr>RENCANA KEBUTUHAN TENAGA KERJA</tr> -->
                        <tr class="" style="font-size: 11px;">
                                <td width="8%"></td>
                                <td style="" width="20%">Tujuan</td>
                                <td width="2%">: </td>
                                <td>{{$form->tujuan}}</td>
                                <td><div style="margin-bottom: 2em;"></div></td>
                        </tr>
                        <tr class="" style="font-size: 11px;">
                                <td width="8%"></td>
                                <td style="" width="20%">Keperluan</td>
                                <td width="2%">: </td>
                                <td>{{$form->keperluan}}</td>
                                <td><div style="margin-bottom: 2em;"></div></td>
                        </tr>
                        <tr class="" style="font-size: 11px;">
                                <td width="8%"></td>
                                <td style="" width="20%">Lama Perjalanan</td>
                                <td width="2%">: </td>
                                <td>{{ Carbon\Carbon::parse($form->tgl_berangkat)->locale('id_ID')->isoFormat('LL') }} &nbsp; s/d &nbsp; {{ Carbon\Carbon::parse($form->tgl_kembali)->locale('id_ID')->isoFormat('LL') }}</td>
                                <td><div style="margin-bottom: 2em;"></div></td>
                        </tr>
                        <tr class="" style="font-size: 11px;">
                                <td width="8%"></td>
                                <td style="" width="20%">Jarak Perjalanan</td>
                                <td width="2%">: </td>
                                <td>{{$form->jarak}}</td>
                                <td><div style="margin-bottom: 2em;"></div></td>
                        </tr>
                        <tr class="" style="font-size: 11px;">
                                <td width="8%"></td>
                                <td style="" width="20%">Lama</td>
                                <td width="2%">: </td>
                                <td>{{$form->lama_hari}} Hari</td>
                                <td><div style="margin-bottom: 2em;"></div></td>
                        </tr>
                        <tr class="" style="font-size: 11px;">
                                <td width="8%"></td>
                                <td style="" width="20%">Transport</td>
                                <td width="2%">: </td>
                                <td>{{$form->kendaraan}}</td>
                                <td><div style="margin-bottom: 2em;"></div></td>
                        </tr>
                </table>
                <br>
                <table class="tbl mt-1" style="">
                <tr class="" style="font-size: 11px;">
                                <td width="8%"><div style="margin-top: 2em;"></div></td>
                                <td width="">Diajukan Tanggal, {{ Carbon\Carbon::parse($form->created_at)->locale('id_ID')->isoFormat('LL') }}</td>
                                <td></td>
                                <td></td>
                        </tr>
                        <br>
                        <tr class="">
                                <td width="8%"></td>
                                <td style="">
                                        <center>
                                                <p style="font-size: 11px;"><b>Pelaksana Tugas</b></p>
                                                <img style="margin-top: 1em;" src="storage/upload/ttd/{{$pelaksana->signature}}" width="100">
                                                <p><b style="font-size: 10px; text-decoration: underline; ">{{$pelaksana->name}}</b></p>
                                                @if($pelaksana->grade == '6')
                                                <p style="margin-top: -0.9em;"><b style="font-size: 10px;">Direktur</b></p>
                                                @elseif($pelaksana->grade == '5')
                                                <p style="margin-top: -0.9em;"><b style="font-size: 10px;">Kabag {{$pelaksana->departemen}}</b></p>
                                                @else
                                                <p style="margin-top: -0.9em;"><b style="font-size: 10px;">{{$pelaksana->jabatan}}</b></p>
                                                @endif

                                        </center>
                                </td>
                                <td>
                                        <center>
                                                <p style="font-size: 11px;"><b>Pemberi Tugas</b></p>
                                                @if($form->status > 1 && $form->status <= 110)
                                                <img style="margin-top: 1em;" src="storage/upload/ttd/{{$user->signature}}" width="100">
                                                @else
                                                <img style="margin-top: 1em;" src="storage/upload/ttd/polos.png" width="100">
                                                @endif
                                                <p><b style="font-size: 10px; text-decoration: underline; ">{{$user->name}}</b></p>
                                                @if($user->grade == '6')
                                                <p style="margin-top: -0.9em;"><b style="font-size: 10px;">Direktur</b></p>
                                                @elseif($user->grade == '5')
                                                <p style="margin-top: -0.9em;"><b style="font-size: 10px;">Kabag {{$user->departemen}}</b></p>
                                                @else
                                                <p style="margin-top: -0.9em;"><b style="font-size: 10px;">{{$user->jabatan}}</b></p>
                                                @endif
                                        </center>
                                </td>
                                <td>
                                        <center>
                                                <p style="font-size: 11px;"><b>Diketahui</b></p>
                                                @if($form->status > 2 && $form->status <= 110)
                                                <img style="margin-top: 1em;" src="storage/upload/ttd/{{$sdm->signature}}" width="100">
                                                @else
                                                <img style="margin-top: 1em;" src="storage/upload/ttd/polos.png" width="100">
                                                @endif
                                                <p><b style="font-size: 10px; text-decoration: underline; ">{{$sdm->name}}</b></p>
                                                <p style="margin-top: -0.9em;"><b style="font-size: 10px;">{{$sdm->jabatan}}</b></p>
                                        </center>
                                </td>


                        </tr>
                </table>
                <!-- <div class="mt-2" >
                        <center><b class="">PERSYARATAN</b></center>
                        <div class="row">
                                <div class="col-md-2"></div>
                                <div class="col-md-4">Jenis Kelamin</div>
                                <div class="col-md-6">: Transjakarta</div>
                        </div>
                </div> -->
        <!-- </div> -->
        <!-- <script src="https://code.jquery.com/jquery-3.2.1.slim.min.js" integrity="sha384-KJ3o2DKtIkvYIK3UENzmM7KCkRr/rE9/Qpg6aAZGJwFDMVNA/GpGFF93hXpG5KkN" crossorigin="anonymous"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.12.9/umd/popper.min.js" integrity="sha384-ApNbgh9B+Y1QKtv3Rn7W3mgPxhU9K/ScQsAP7hUibX39j7fakFPskvXusvfa0b4Q" crossorigin="anonymous"></script>
        <script src="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/js/bootstrap.min.js" integrity="sha384-JZR6Spejh4U02d8jOt6vLEHfe/JQGiRRSQQxSfFWpi1MquVdAyjUar5+76PVCmYl" crossorigin="anonymous"></script> -->
</body>
</html>
